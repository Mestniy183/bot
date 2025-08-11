const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const admin = require("firebase-admin");
require("dotenv").config();

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: false });
const app = express();
const adminChatId = process.env.ID;
const port = process.env.PORT || 3000;
const webhookURL = process.env.WEBHOOK_URL;

bot.setMyCommands([
  { command: "/start", description: "Запуск бота и получение данных" },
  { command: "/orders", description: "Посмотреть заказы в работе" },
  { command: "/completed", description: "Посмотреть выполненные заказы" },
]);

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL,
});

const db = admin.database();

bot.setWebHook(`${webhookURL}/bot${token}`);

app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

function formatDate(isoDate) {
  if (!isoDate) return "дата неизвестна";
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    console.error("Ошибка форматирования даты:", e);
    return isoDate; //возвращаем как есть, если не удалось распарсить
  }
}

function setupOrderListener() {
  const ordersRef = db.ref("orders");

  ordersRef.on("child_added", async (snapshot) => {
    const order = snapshot.val();
    const orderId = snapshot.key;
    if (!order.processed && !order.completed) {
      const message = `Новый заказ №${orderId}:\n
        Дата: ${order.date}\n
        Имя: ${order.name}\n
        Телефон: ${order.phone}\n
        Сообщение: ${order.message || "No message"} 
      `;
      try {
        const cleanPhone = order.phone.replace(/\D/g, "");
        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: "Написать в тг",
                url: `https://t.me/+${cleanPhone}`,
              },
              {
                text: "Написать в WA",
                url: `https://wa.me/${cleanPhone}`,
              },
            ],
            [
              {
                text: "✅ Завершить заказ",
                callback_data: `complete_${orderId}`,
              },
              {
                text: "❌ Удалить заказ",
                callback_data: `delete_${orderId}`,
              },
            ],
          ],
        };

        await bot.sendMessage(adminChatId, message, {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        });

        await snapshot.ref.update({ processed: true, id: orderId });
      } catch (error) {
        console.error("Ошибка отправки уведомления", error);
      }
    }
  });
}

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;

  if (data.startsWith("complete_")) {
    const orderId = data.split("_")[1];
    try {
      await db.ref(`orders/${orderId}`).update({
        completed: true,
        completedAt: new Date().toISOString(),
      });

      const messageText = callbackQuery.message.text;
      const newReplyMarkup = {
        inline_keyboard: [
          [
            {
              text: "Написать в тг",
              url: `https://t.me/+${
                callbackQuery.message.reply_markup.inline_keyboard[0][0].url.split(
                  "+"
                )[1]
              }`,
            },
            {
              text: "Написать в WA",
              url: callbackQuery.message.reply_markup.inline_keyboard[0][1].url,
            },
          ],
        ],
      };

      await bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: newReplyMarkup,
      });

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `Заказ №${orderId} отмечен как выполненный ✅`,
      });

      await bot.sendMessage(chatId, `Заказ №${orderId} успешно завершён`);
    } catch (error) {
      console.error("Ошибка при завершении заказа:", error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Ошибка при завершении заказа",
      });
    }
  } else if (data.startsWith("delete_")) {
    const orderId = data.split("_")[1];
    try {
      //Удаляем сообщение из базы данных
      await db.ref(`orders/${orderId}`).remove();

      //Удаляем сообщение с заказом
      await bot.deleteMessage(chatId, messageId);

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `Заказ №${orderId} был удалён`,
      });
      await bot.sendMessage(chatId, `Заказ №${orderId} был удалён`);
    } catch (error) {
      console.error("Ошибка при удалении заказа:", error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Ошибка при удалении заказа",
      });
    }
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "/start") {
    await bot.sendMessage(chatId, `Бот запущен, проверяем данные...`);
  } else if (text === "/orders") {
    try {
      const snapshot = await db
        .ref("orders")
        .orderByChild("completed")
        .equalTo(false)
        .once("value");
      const orders = snapshot.val();

      if (!orders) {
        return bot.sendMessage(chatId, "Заказов нет в работе");
      }

      await bot.sendMessage(
        chatId,
        `Заказов в работе: ${Object.keys(orders).length}`,
        { parse_mode: "Markdown" }
      );

      Object.entries(orders).forEach(([orderId, order], index) => {
        setTimeout(async () => {
          try {
            const orderMsg = `заказ №${orderId}:\n
              Дата: ${order.date}\n
              Имя: ${order.name}\n
              Телефон: ${order.phone}\n
              Сообщение: ${order.message || "No message"} 
          `;

            const cleanPhone = order.phone.replace(/\D/g, "");
            const replyMarkup = {
              inline_keyboard: [
                [
                  {
                    text: "Написать в тг",
                    url: `https://t.me/+${cleanPhone}`,
                  },
                  {
                    text: "Написать в WA",
                    url: `https://wa.me/${cleanPhone}`,
                  },
                ],
                [
                  {
                    text: "✅ Завершить заказ",
                    callback_data: `complete_${orderId}`,
                  },
                  {
                    text: "❌ Удалить заказ",
                    callback_data: `delete_${orderId}`,
                  },
                ],
              ],
            };

            await bot.sendMessage(chatId, orderMsg, {
              parse_mode: "Markdown",
              reply_markup: replyMarkup,
            });
          } catch (error) {
            console.error(`Ошибка отправки заказа ${orderId}:`, error);
          }
        }, index * 500);
      });
    } catch (error) {
      console.error("Ошибка получения заказов:", error);
      bot.sendMessage(chatId, "Ошибка при получении заказов");
    }
  } else if (text === "/completed") {
    try {
      const snapshot = await db
        .ref("orders")
        .orderByChild("completed")
        .equalTo(true)
        .once("value");
      const orders = snapshot.val();

      if (!orders) {
        return bot.sendMessage(chatId, "Нет выполненных заказов");
      }

      await bot.sendMessage(
        chatId,
        `Выполненных заказов: ${Object.keys(orders).length}`,
        { parse_mode: "Markdown" }
      );

      Object.entries(orders).forEach(([orderId, order], index) => {
        setTimeout(async () => {
          try {
            const orderMsg = `заказ №${orderId} (Выполнен ${
              order.completedAt
                ? formatDate(order.completedAt)
                : "дата неизвестна"
            }):\n
              Дата: ${order.date}\n
              Имя: ${order.name}\n
              Телефон: ${order.phone}\n
              Сообщение: ${order.message || "No message"} 
          `;

            const cleanPhone = order.phone.replace(/\D/g, "");
            const replyMarkup = {
              inline_keyboard: [
                [
                  {
                    text: "Написать в тг",
                    url: `https://t.me/+${cleanPhone}`,
                  },
                  {
                    text: "Написать в WA",
                    url: `https://wa.me/${cleanPhone}`,
                  },
                ],
                [
                  {
                    text: "❌ Удалить заказ",
                    callback_data: `delete_${orderId}`,
                  },
                ],
              ],
            };

            await bot.sendMessage(chatId, orderMsg, {
              parse_mode: "Markdown",
              reply_markup: replyMarkup,
            });
          } catch (error) {
            console.error(`Ошибка отправки заказа ${orderId}:`, error);
          }
        }, index * 500);
      });
    } catch (error) {
      console.error("Ошибка получения заказов:", error);
      bot.sendMessage(chatId, "Ошибка при получении заказов");
    }
  } else {
    bot.sendMessage(chatId, `Неизвестная команда...`);
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log(`webhook URL: ${webhookURL}/bot${token}`);

  setupOrderListener();

  db.ref(".info/connected").on("value", (snapshot) => {
    if (snapshot.val() === true) {
      console.log("Подключено к бд");
    } else {
      console.log("Нет подключения к бд.");
    }
  });
});

process.on("unhandledRejection", (error) => {
  console.error(error);
});
