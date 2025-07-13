import {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder,
  ButtonStyle, ActionRowBuilder, InteractionType,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Config
const STAFF_ROLE_ID = '1218990787031732344';
const LOGS_RESIDENZE_CHANNEL_ID = '1393946728276820180';
const CITTADINANZE_CHANNEL_ID = '1282837104925347871';
const RUOLO_CITTADINO_ID = '1193212958180917339';
const LOGS_SEGNALAZIONI_CHANNEL_ID = '1394036740100067509';

const commands = [
  new SlashCommandBuilder()
    .setName('residenza')
    .setDescription('Invia richiesta di residenza a Rimini')
    .addStringOption(opt => opt.setName('username_roblox').setDescription('Il tuo username Roblox').setRequired(true))
    .addStringOption(opt => opt.setName('nome_rp').setDescription('Il tuo nome RP').setRequired(true))
    .addStringOption(opt => opt.setName('cognome_rp').setDescription('Il tuo cognome RP').setRequired(true))
    .addStringOption(opt => opt.setName('data_nascita_rp').setDescription('Data di nascita RP (es. 01/01/2000)').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('⏳ Registrazione comandi slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comandi registrati.');
  } catch (err) {
    console.error(err);
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot pronto! Logged in come ${client.user.tag}`);
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  // /residenza
  if (interaction.type === InteractionType.ApplicationCommand && interaction.commandName === 'residenza') {
    const usernameRoblox = interaction.options.getString('username_roblox');
    const nomeRp = interaction.options.getString('nome_rp');
    const cognomeRp = interaction.options.getString('cognome_rp');
    const dataNascitaRp = interaction.options.getString('data_nascita_rp');

    const diffDays = (Date.now() - interaction.user.createdAt) / (1000 * 60 * 60 * 24);
    if (diffDays < 90) {
      const logsSegnalazioniChannel = await client.channels.fetch(LOGS_SEGNALAZIONI_CHANNEL_ID);
      await logsSegnalazioniChannel.send({
        content: `⚠️ Utente <@${interaction.user.id}> ha un account giovane: ${Math.floor(diffDays)} giorni.`
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Nuova richiesta di residenza')
      .setColor('#0099ff')
      .addFields(
        { name: 'Username Roblox', value: usernameRoblox, inline: true },
        { name: 'Nome RP', value: nomeRp, inline: true },
        { name: 'Cognome RP', value: cognomeRp, inline: true },
        { name: 'Data di nascita RP', value: dataNascitaRp, inline: true },
        { name: 'Richiedente Discord', value: `${interaction.user.tag} (${interaction.user.id})` }
      )
      .setTimestamp();

    const accettaBtn = new ButtonBuilder().setCustomId(`accetta_${interaction.user.id}`).setLabel('Accetta').setStyle(ButtonStyle.Success);
    const rifiutaBtn = new ButtonBuilder().setCustomId(`rifiuta_${interaction.user.id}`).setLabel('Rifiuta').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(accettaBtn, rifiutaBtn);

    const logsChannel = await client.channels.fetch(LOGS_RESIDENZE_CHANNEL_ID);
    await logsChannel.send({ embeds: [embed], components: [row] });

    await interaction.reply({ content: '✅ Richiesta inviata allo staff.', ephemeral: true });
  }

  // Pulsanti accetta / rifiuta
  else if (interaction.type === InteractionType.MessageComponent) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
      return interaction.reply({ content: '⛔ Non hai i permessi.', ephemeral: true });
    }

    const [azione, userid] = interaction.customId.split('_');

    if (azione === 'accetta') {
      const embed = interaction.message.embeds[0];
      const username = embed?.fields.find(f => f.name === 'Username Roblox')?.value || 'Sconosciuto';

      const cittadinanzeChannel = await client.channels.fetch(CITTADINANZE_CHANNEL_ID);
      const member = await interaction.guild.members.fetch(userid).catch(() => null);

      if (member) {
        await member.roles.add(RUOLO_CITTADINO_ID).catch(() => {});
        await member.send(`🏡 La tua richiesta di Residenza è stata **Accettata**. Benvenuto cittadino!`);
      }

      const embedEsito = new EmbedBuilder()
        .setTitle('Rimini - Esito Residenza')
        .addFields({ name: 'Username Roblox', value: username })
        .setDescription('✅ **ACCETTATO**')
        .setTimestamp()
        .setFooter({ text: `Moderatore: ${interaction.user.tag}` });

      await cittadinanzeChannel.send({ embeds: [embedEsito] });

      const disabledRow = new ActionRowBuilder().addComponents(
        interaction.message.components[0].components.map(btn => btn.setDisabled(true))
      );
      await interaction.update({ components: [disabledRow] });
    }

    if (azione === 'rifiuta') {
      const modal = new ModalBuilder().setCustomId(`modal_rifiuta_${userid}`).setTitle('Motivazione Rifiuto');
      const input = new TextInputBuilder()
        .setCustomId('motivazione')
        .setLabel('Motivo del rifiuto')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Inserisci qui la motivazione');

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }
  }

  // Modal di rifiuto
  else if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith('modal_rifiuta_')) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
      return interaction.reply({ content: '⛔ Non hai i permessi.', ephemeral: true });
    }

    const userid = interaction.customId.split('_')[2];
    const motivazione = interaction.fields.getTextInputValue('motivazione');

    const logsChannel = await client.channels.fetch(LOGS_RESIDENZE_CHANNEL_ID);
    const cittadinanzeChannel = await client.channels.fetch(CITTADINANZE_CHANNEL_ID);

    const messages = await logsChannel.messages.fetch({ limit: 20 });
    const msg = messages.find(m => m.components[0]?.components.some(btn => btn.customId === `rifiuta_${userid}`));
    const embed = msg?.embeds[0];
    const username = embed?.fields.find(f => f.name === 'Username Roblox')?.value || 'Sconosciuto';

    const embedEsito = new EmbedBuilder()
      .setTitle('Rimini - Esito Residenza')
      .addFields(
        { name: 'Username Roblox', value: username },
        { name: 'Motivazione Rifiuto', value: motivazione }
      )
      .setDescription('❌ **RIFIUTATO**')
      .setTimestamp()
      .setFooter({ text: `Moderatore: ${interaction.user.tag}` });

    await cittadinanzeChannel.send({ embeds: [embedEsito] });

    const member = await interaction.guild.members.fetch(userid).catch(() => null);
    if (member) {
      await member.send(`❌ La tua richiesta di Residenza è stata **Rifiutata**.\n📌 Motivo: ${motivazione}`).catch(() => {});
    }

    const disabledRow = new ActionRowBuilder().addComponents(
      msg.components[0].components.map(btn => btn.setDisabled(true))
    );
    await msg.edit({ components: [disabledRow] });

    await interaction.reply({ content: '⛔ Rifiuto inviato con motivazione.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);

// 🌐 Express per Render + UptimeRobot
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Bot Residenza Rimini attivo!');
});

app.listen(port, () => {
  console.log(`🌐 Express attivo su porta ${port}`);
});