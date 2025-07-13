import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Configurazioni
const STAFF_ROLE_ID = '1218990787031732344';
const LOGS_RESIDENZE_CHANNEL_ID = '1393946728276820180';
const CITTADINANZE_CHANNEL_ID = '1282837104925347871';
const RUOLO_CITTADINO_ID = '1193212958180917339';
const LOGS_SEGNALAZIONI_CHANNEL_ID = '1394036740100067509';

const commands = [
  new SlashCommandBuilder()
    .setName('residenza')
    .setDescription('Invia richiesta di residenza a Rimini')
    .addStringOption(option => option.setName('username_roblox').setDescription('Il tuo username Roblox').setRequired(true))
    .addStringOption(option => option.setName('nome_rp').setDescription('Il tuo nome RP').setRequired(true))
    .addStringOption(option => option.setName('cognome_rp').setDescription('Il tuo cognome RP').setRequired(true))
    .addStringOption(option => option.setName('data_nascita_rp').setDescription('La tua data di nascita RP (es. 01/01/2000)').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
}

client.once('ready', () => {
  console.log(`Bot pronto! Logged in come ${client.user.tag}`);
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  // Comando /residenza
  if (interaction.type === InteractionType.ApplicationCommand) {
    if (interaction.commandName === 'residenza') {
      const usernameRoblox = interaction.options.getString('username_roblox');
      const nomeRp = interaction.options.getString('nome_rp');
      const cognomeRp = interaction.options.getString('cognome_rp');
      const dataNascitaRp = interaction.options.getString('data_nascita_rp');

      // Controllo data creazione account Discord
      const now = new Date();
      const createdAt = interaction.user.createdAt;
      const diffMs = now - createdAt;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays < 90) {
        const logsSegnalazioniChannel = await client.channels.fetch(LOGS_SEGNALAZIONI_CHANNEL_ID);
        await logsSegnalazioniChannel.send({
          content: `⚠️ Attenzione! Utente <@${interaction.user.id}> ha fatto richiesta residenza ma il suo account Discord è **giovane** (${Math.floor(diffDays)} giorni).`
        });
      }

      // Embed richiesta
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

      const accettaBtn = new ButtonBuilder()
        .setCustomId(`accetta_${interaction.user.id}`)
        .setLabel('Accetta')
        .setStyle(ButtonStyle.Success);

      const rifiutaBtn = new ButtonBuilder()
        .setCustomId(`rifiuta_${interaction.user.id}`)
        .setLabel('Rifiuta')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(accettaBtn, rifiutaBtn);

      const logsChannel = await client.channels.fetch(LOGS_RESIDENZE_CHANNEL_ID);
      await logsChannel.send({ embeds: [embed], components: [row] });

      await interaction.reply({ content: 'La tua richiesta di residenza è stata inviata allo staff per la verifica.', ephemeral: true });
    }
  } 

  // Gestione pulsanti accetta/rifiuta
  else if (interaction.type === InteractionType.MessageComponent) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
      await interaction.reply({ content: 'Non hai il permesso di usare questo pulsante.', ephemeral: true });
      return;
    }

    const [azione, userid] = interaction.customId.split('_');

    if (azione === 'accetta') {
      const embed = interaction.message.embeds[0];
      if (!embed) {
        await interaction.reply({ content: 'Embed non trovato, impossibile procedere.', ephemeral: true });
        return;
      }
      const usernameRobloxField = embed.fields.find(f => f.name === 'Username Roblox');
      if (!usernameRobloxField) {
        await interaction.reply({ content: 'Dati della richiesta mancanti.', ephemeral: true });
        return;
      }
      const usernameRoblox = usernameRobloxField.value;

      const cittadinanzeChannel = await client.channels.fetch(CITTADINANZE_CHANNEL_ID);

      // Assegna ruolo cittadino
      const member = await interaction.guild.members.fetch(userid).catch(() => null);
      if (member) {
        try {
          await member.roles.add(RUOLO_CITTADINO_ID);
        } catch (error) {
          console.error('Errore assegnando ruolo cittadino:', error);
        }
      }

      const esitoEmbed = new EmbedBuilder()
        .setTitle('Rimini - Esito Residenza')
        .addFields({ name: 'Username Roblox', value: usernameRoblox })
        .setDescription('✅ **ACCETTATO**')
        .setTimestamp()
        .setFooter({ text: `Moderatore: ${interaction.user.tag}` });

      await cittadinanzeChannel.send({ embeds: [esitoEmbed] });

      if (member) {
        try {
          await member.send(`Ciao! La tua richiesta di Residenza è stata **Accettata**. Benvenuto cittadino! 🎉`);
        } catch {}
      }

      // Disabilita pulsanti
      const disabledRow = new ActionRowBuilder().addComponents(
        interaction.message.components[0].components.map(btn => btn.setDisabled(true))
      );
      await interaction.update({ components: [disabledRow] });
    }
    else if (azione === 'rifiuta') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_rifiuta_${userid}`)
        .setTitle('Motivazione rifiuto');

      const motivazioneInput = new TextInputBuilder()
        .setCustomId('motivazione')
        .setLabel('Inserisci la motivazione del rifiuto')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Motivazione del rifiuto...');

      const firstActionRow = new ActionRowBuilder().addComponents(motivazioneInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    }
  } 

  // Gestione modal rifiuto
  else if (interaction.type === InteractionType.ModalSubmit) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
      await interaction.reply({ content: 'Non hai il permesso di usare questo modulo.', ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('modal_rifiuta_')) {
      const userid = interaction.customId.split('_')[2];
      const motivazione = interaction.fields.getTextInputValue('motivazione');

      const logsChannel = await client.channels.fetch(LOGS_RESIDENZE_CHANNEL_ID);
      const cittadinanzeChannel = await client.channels.fetch(CITTADINANZE_CHANNEL_ID);

      const messages = await logsChannel.messages.fetch({ limit: 20 });
      const msg = messages.find(m => m.components.length > 0 && m.components[0].components.some(b => b.customId === `rifiuta_${userid}`));
      if (!msg) {
        await interaction.reply({ content: 'Messaggio originale non trovato, impossibile procedere.', ephemeral: true });
        return;
      }

      const embed = msg.embeds[0];
      if (!embed) {
        await interaction.reply({ content: 'Embed non trovato, impossibile procedere.', ephemeral: true });
        return;
      }
      const usernameRobloxField = embed.fields.find(f => f.name === 'Username Roblox');
      if (!usernameRobloxField) {
        await interaction.reply({ content: 'Dati della richiesta mancanti.', ephemeral: true });
        return;
      }
      const usernameRoblox = usernameRobloxField.value;

      const esitoEmbed = new EmbedBuilder()
        .setTitle('Rimini - Esito Residenza')
        .addFields(
          { name: 'Username Roblox', value: usernameRoblox },
          { name: 'Motivazione Rifiuto', value: motivazione }
        )
        .setDescription('❌ **RIFIUTATO**')
        .setTimestamp()
        .setFooter({ text: `Moderatore: ${interaction.user.tag}` });

      await cittadinanzeChannel.send({ embeds: [esitoEmbed] });

      const member = await interaction.guild.members.fetch(userid).catch(() => null);
      if (member) {
        try {
          await member.send(`Ciao! La tua richiesta di Residenza è stata **Rifiutata**.\nMotivo: ${motivazione}`);
        } catch {}
      }

      const disabledRow = new ActionRowBuilder().addComponents(
        msg.components[0].components.map(btn => btn.setDisabled(true))
      );
      await msg.edit({ components: [disabledRow] });

      await interaction.reply({ content: 'Hai inviato il rifiuto con motivazione.', ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);

// ——— SERVER EXPRESS PER RENDER/UPTIMEROBOT ———
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Bot Residenza Rimini attivo!');
});

app.listen(port, () => {
  console.log(`🌐 Web server Express avviato su porta ${port}`);
});
