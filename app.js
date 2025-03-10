const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = process.env.API_URL;

bot.setMyCommands([
  { command: "/start", description: "Запуск бота и получение данных" },
  { command: "/orders", description: "Посмотреть все заказы" },
]);

const dataFilePath = path.join(__dirname, "db.json");
let lastData = [];
try {
  if (fs.existsSync(dataFilePath)) {
    const data = fs.readFileSync(dataFilePath, "utf8");
    if (data.trim()) {
      lastData = JSON.parse(data);
    } else {
      console.log("Файл db.json пустой. Инициализируем пустым массивом");
      lastData = [];
    }
  } else {
    console.log("Файл db.json не существует. Инициализируем пустым массивом");
    lastData = [];
  }
} catch (error) {
  console.error("Ошибка при чтении файла db.json:", error);
  lastData = [];
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
    if (data && data.length > 0) {
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
    } else {
      console.log("Данные сервера отсутствуют или пустые");
    }
  } catch (error) {
    console.error("Ошибка при проверке новых данных", error);
    bot.sendMessage(chatId, "Ошибка при проверке новых данных");
  }
}

setInterval(() => {
  checkForNewData(process.env.ID);
}, 10000);

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