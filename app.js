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
  { command: "/orders", description: "Посмотреть все заказы" },
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

function setupOrderListener() {
  const ordersRef = db.ref("orders");

  ordersRef.on("child_added", async (snapshot) => {
    const order = snapshot.val();
    const orderId = snapshot.key;
    if (!order.processed) {
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

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "/start") {
    await bot.sendMessage(chatId, `Бот запущен, проверяем данные...`);
  } else if (text === "/orders") {
    try {
      const snapshot = await db.ref("orders").once("value");
      const orders = snapshot.val();

      if (!orders) {
        return bot.sendMessage(chatId, "Заказов нет");
      }

      await bot.sendMessage(
        chatId,
        `Всего заказов: ${Object.keys(orders).length}`,
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
