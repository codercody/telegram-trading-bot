require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const supabase = require('../src/utils/supabase');

// Initialize bot with your token
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false }); // Disable polling for serverless

// Translations
const translations = require('../src/translations');

// Helper function to send bilingual messages
async function sendBilingualMessage(chatId, enMessage, zhMessage) {
  await bot.sendMessage(chatId, `${enMessage}\n\n${zhMessage}`);
}

// Helper function to get or create user
async function getOrCreateUser(telegramId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
    throw error;
  }

  if (!user) {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ telegram_id: telegramId }])
      .select()
      .single();

    if (insertError) throw insertError;
    return newUser;
  }

  return user;
}

// Helper function to verify PIN
async function verifyPin(telegramId, pin) {
  const { data: user, error } = await supabase
    .from('users')
    .select('pin')
    .eq('telegram_id', telegramId)
    .single();

  if (error) throw error;
  return user.pin === pin;
}

// Command handlers
async function handleStart(msg) {
  const chatId = msg.chat.id;
  await getOrCreateUser(chatId);
  
  const enMessage = translations.welcome.en + Object.values(translations.commands).map(cmd => cmd.en).join('\n');
  const zhMessage = translations.welcome.zh + Object.values(translations.commands).map(cmd => cmd.zh).join('\n');
  await sendBilingualMessage(chatId, enMessage, zhMessage);
}

async function handleBalance(msg) {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(chatId);
  
  await sendBilingualMessage(
    chatId,
    translations.messages.balance.en(user.balance),
    translations.messages.balance.zh(user.balance)
  );
}

async function handlePositions(msg) {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(chatId);
  
  const { data: positions, error } = await supabase
    .from('positions')
    .select('*')
    .eq('telegram_id', chatId);

  if (error) throw error;

  if (positions.length === 0) {
    await sendBilingualMessage(
      chatId,
      translations.messages.noPositions.en,
      translations.messages.noPositions.zh
    );
    return;
  }

  const enMessage = translations.messages.positions.en + 
    positions.map(pos => translations.messages.positionFormat.en(pos.symbol, pos.quantity, pos.avg_price)).join('\n');
  
  const zhMessage = translations.messages.positions.zh + 
    positions.map(pos => translations.messages.positionFormat.zh(pos.symbol, pos.quantity, pos.avg_price)).join('\n');
  
  await sendBilingualMessage(chatId, enMessage, zhMessage);
}

// Add more command handlers here...

// Main handler for Vercel
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    
    // Handle only message updates
    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text;

    // Handle commands
    if (text.startsWith('/')) {
      const command = text.split(' ')[0];
      
      switch (command) {
        case '/start':
          await handleStart(msg);
          break;
        case '/balance':
          await handleBalance(msg);
          break;
        case '/positions':
          await handlePositions(msg);
          break;
        // Add more command handlers here...
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error handling update:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}; 