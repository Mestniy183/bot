const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const token = process.env.TOKEN;
const apiUrl = process.env.API_URL;
const chatId = process.env.ID;

if (!token || !apiUrl || !chatId) {
  throw new Error("Не заданы токены");
}

const bot = new TelegramBot(token, { polling: true });

bot.setMyCommands([
  { command: "/start", description: "Запуск бота и получение данных" },
  { command: "/orders", description: "Посмотреть все заказы" },
]);

const dataFilePath = path.join(__dirname, "db.json");
let lastData = [];

async function loadData() {
  try {
    const data = await fs.readFile(dataFilePath, "utf8");
    return data.trim() ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Ошибка при чтении db.json:", error);
    return [];
  }
}

async function saveData(data) {
  try {
    await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Ошибка при записи db.json:", error);
  }
}

function formatOrderMessage(item) {
  return `Заказ ${item.id}:\nДата: ${item.date}\nИмя: ${item.name}\nТелефон: ${item.phone}\nСообщение: ${item.message}`;
}

async function fetchData() {
  try {
    const response = await axios.get(apiUrl);
    if (!response.data) throw new Error("Данные не получены");
    return response.data;
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    throw error;
  }
}

async function sendOrders(chatId, orders) {
  const batchSize = 5;
  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    await Promise.all(
      batch.map((order) => bot.sendMessage(chatId, formatOrderMessage(order)))
    );
  }
}

async function checkForNewData(chatId) {
  try {
    const data = await fetchData();
    if (!data?.length) {
      console.log("No data");
      return;
    }

    if (newData.length) {
    }
  } catch (error) {
    console.error("Ошибка при проверке новых данных", error);
    bot.sendMessage(chatId, "Ошибка при проверке новых данных");
  }
}

// setInterval(() => {
//   checkForNewData(process.env.ID);
// }, 10000);

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "/start") {
    bot.sendMessage(chatId, `Бот запущен, проверяем данные...`);
    checkForNewData(chatId);
  } else if (text === "/orders") {
    bot.sendMessage(chatId, `Отправляю все заказы...`);
    const data = await fetchData();
    console.log(data);
    data.forEach((item, index) => {
      setTimeout(() => {
        const mes = `Заказ ${item.id}:\nДата: ${item.date}\nИмя: ${item.name}\nТелефон: ${item.phone}\nСообщение: ${item.message}`;
        bot.sendMessage(chatId, mes);
      }, index * 100);
    });
  } else {
    bot.sendMessage(chatId, `Неизвестная команда...`);
  }
});

bot.on("polling_error", (error) => {
  console.error(error);
});
