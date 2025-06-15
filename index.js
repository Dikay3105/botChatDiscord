require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateFileFromResponse } = require('./fileGenerator');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType } = require('discord.js');
const axios = require('axios');

// Slash command
const commands = [
    new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Trò chuyện với AI và nhận file nếu cần')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Bạn muốn hỏi gì?')
                .setRequired(true)
        )
        .toJSON()
];

// Đăng ký slash command
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('🚀 Đang đăng ký slash command...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Slash command đã được đăng ký.');
    } catch (error) {
        console.error('❌ Lỗi khi đăng ký command:', error);
    }
})();

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'ai') return;

    await interaction.deferReply();

    const prompt = interaction.options.getString('prompt'); // ✅ LẤY PROMPT Ở ĐÂY

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'qwen/qwen3-32b:free',
                messages: [{ role: 'user', content: prompt }],
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const reply = response.data.choices[0].message.content;
        console.log(`📤 Trả lời AI (${reply.length} ký tự)`);

        const file = await generateFileFromResponse(prompt, reply);
        if (file) {
            await interaction.editReply({
                content: '📝 Đây là file bạn yêu cầu:',
                files: [file],
            });
        } else {
            const maxLength = 2000;
            if (reply.length <= maxLength) {
                await interaction.editReply(reply);
            } else {
                const chunks = reply.match(/[\s\S]{1,2000}/g);
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp(chunks[i]);
                }
            }
        }
    } catch (error) {
        console.error('❌ Lỗi AI:', error.response?.data || error.message);
        await interaction.editReply('❌ Có lỗi xảy ra khi gọi OpenRouter.');
    }
});


client.login(process.env.DISCORD_TOKEN);
