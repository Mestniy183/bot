const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { setInterval } = require("timers/promises");
require("dotenv").config();

const token = process.env.TOKEN;
const apiUrl = process.env.API_URL;
const adminChatId = process.env.ID;
const port = process.env.PORT || 3000;
const webhookURL = process.env.WEBHOOK_URL;

const bot = new TelegramBot(token, { webHook: { port: port } });

const app = express();

bot.setWebHook(`${webhookURL}/bot${token}`);

app.use(express.json());

const dataFilePath = path.join(__dirname, "db.json");
let lastData = loadData();

function loadData() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const data = fs.readFileSync(dataFilePath, "utf8");
      return data.trim() ? JSON.parse(data) : [];
    }
    return [];
  } catch (error) {
    console.error("Ошибка при чтении файла db.json:", error);
    return [];
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Ошибка при сохранении db.JSON", error);
  }
}

async function fetchData() {
  try {
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    return null;
  }
}

async function checkForNewData(chatId) {
  try {
    const data = await fetchData();

    if (!data || data.length === 0) return;

    const newData = data.filter((item) => {
      return !lastData.some((lastItem) => lastItem.id === item.id);
    });

    if (newData.length > 0) {
      newData.forEach((item) => {
        const mes = `Пришёл новый заказ ${item.id}:\nДата: ${item.date}\nИмя: ${item.name}\nТелефон: ${item.phone}\nСообщение: ${item.message}`;
        bot.sendMessage(chatId, mes);
      });
      lastData = data;
      saveData(lastData);
    }
  } catch (error) {
    console.error("Ошибка при проверке новых данных", error);
    bot.sendMessage(chatId, "Ошибка при проверке новых данных");
  }
}

bot.setMyCommands([
  { command: "/start", description: "Запуск бота и получение данных" },
  { command: "/orders", description: "Посмотреть все заказы" },
]);

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Телеграмбот запущен");
});

setInterval(() => {
  checkForNewData(adminChatId);
}, 30 * 1000);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "/start") {
    bot.sendMessage(chatId, `Бот запущен, проверяем данные...`);
    checkForNewData(chatId);
  } else if (text === "/orders") {
    bot.sendMessage(chatId, `Отправляю все заказы...`);
    const data = await fetchData();
    if (!data || data.length === 0) {
      return bot.sendMessage(chatId, "Заказов нет");
    }

    bot.sendMessage(chatId, `Всего заказов: ${data.length}`);
    data.forEach((item, index) => {
      setTimeout(() => {
        const mes = `Заказ ${item.id}:\nДата: ${item.date}\nИмя: ${item.name}\nТелефон: ${item.phone}\nСообщение: ${item.message}`;
        bot.sendMessage(chatId, mes);
      }, index * 300);
    });
  } else {
    bot.sendMessage(chatId, `Неизвестная команда...`);
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log(`webhook URL: ${webhookURL}/bot${token}`);
  if (adminChatId) {
    checkForNewData(adminChatId);
  }
});

process.on("unhandledRejection", (error) => {
  console.error(error);
});
