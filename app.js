import TelegramBot from 'node-telegram-bot-api';
import { get } from 'axios';

const token = '7341329435:AAG2EgMctrPqFUN3vYgz6RpkwdCdG7KUBQw';
const bot = new TelegramBot(token, { poling: true });
const apiUrl = 'https://dc3c997554c1d330.mokky.dev/items';

async function fetchData() {
    try {
        const response = await get(apiUrl);
        return response.data;
    } catch (arror) {
        console.error('Ошибка при получении данных:', error);
        return null;
    }
}

function sendMessage(chatId, message) {
    bot.sendMessage(chatId, message);
}

async function checkForNewData(chatId) {
    const data = await fetchData();
    if (data && data.length > 0) {
        data.forEach(element => {
            const message = `Новый элемент: ${JSON.stringify(element)}`;
            sendMessage(chatId, message);
        });
    } else {
        sendMessage(chatId, `Новых данных нет`)
    }
}

bot.onText(/\start/, (msg) =>{
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Бот запущен, проверяем данные...`);
    setInterval(() =>{
        checkForNewData(chatId)
    }, 10000)
})
bot.on('polling_error', (error) =>{
    console.error(error);
})