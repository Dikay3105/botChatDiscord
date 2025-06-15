require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateFileFromResponse } = require('./fileGenerator');
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
    InteractionType, VoiceChannel
} = require('discord.js');
const axios = require('axios');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const play = require('play-dl');

// Slash command
const commands = [
    new SlashCommandBuilder()
        .setName('ai')
        .setDescription('Trò chuyện với AI và nhận file nếu cần')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Bạn muốn hỏi gì?')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ YouTube')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Link YouTube hoặc tên bài hát')
                .setRequired(true)
        ),
].map(cmd => cmd.toJSON());

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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once('ready', () => {
    console.log(`🤖 Bot đã sẵn sàng: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ai') {
        const prompt = interaction.options.getString('prompt');
        await interaction.deferReply();
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
            const file = await generateFileFromResponse(prompt, reply);

            if (file) {
                await interaction.editReply({
                    content: '📝 Đây là file bạn yêu cầu:',
                    files: [file],
                });
            } else {
                const chunks = reply.match(/[\s\S]{1,2000}/g);
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp(chunks[i]);
                }
            }
        } catch (error) {
            console.error('❌ Lỗi AI:', error.response?.data || error.message);
            await interaction.editReply('❌ Có lỗi xảy ra khi gọi OpenRouter.');
        }
    }

    else if (commandName === 'play') {
        const query = interaction.options.getString('query');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply('❌ Bạn cần tham gia voice channel trước!');
        }

        await interaction.deferReply();

        try {
            const streamInfo = await play.search(query, { limit: 1 });
            const video = streamInfo[0];

            if (!video) return interaction.editReply('❌ Không tìm thấy bài hát nào.');

            const stream = await play.stream(video.url);
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type
            });

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator
            });

            const player = createAudioPlayer();
            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                connection.destroy();
            });

            await interaction.editReply(`🎶 Đang phát: **${video.title}**`);
        } catch (err) {
            console.error('❌ Lỗi khi phát nhạc:', err);
            interaction.editReply('❌ Không thể phát nhạc.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
