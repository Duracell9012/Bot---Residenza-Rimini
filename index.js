import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
dotenv.config();

// Bot Discord
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

// Slash Command
const commands = [
  new SlashCommandBuilder()
    .setName('residenza')
    .setDescription('Invia richiesta di residenza a Rimini')
    .addStringOption(opt => opt.setName('username_roblox').setDescription('Il tuo username Roblox').setRequired(true))
    .addStringOption(opt => opt.setName('nome_rp').setDescription('Il tuo nome RP').setRequired(true))
    .addStringOption(opt => opt.setName('cognome_rp').setDescription('Il tuo cognome RP').setRequired(true))
    .addStringOption(opt => opt.setName('data_nascita_rp').setDescription('Data di nascita RP').setRequired(true))
    .addStringOption(opt => opt.setName('sesso').setDescription('Sesso').setRequired(true)
      .addChoices(
        { name: 'Maschio', value: 'Maschio' },
        { name: 'Femmina', value: 'Femmina' },
        { name: 'Altro', value: 'Altro' }
      )
    )
    .addStringOption(opt => opt.setName('luogo_nascita').setDescription('Luogo di nascita RP').setRequired(true))
    .addStringOption(opt => opt.setName('nel_gruppo').setDescription('Sei nel gruppo Roblox?').setRequired(true)
      .addChoices(
        { name: 'Sì', value: 'Sì' },
        { name: 'No', value: 'No' }
      )
    )
].map(cmd => cmd.toJSON());

// Registra comandi
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ Slash commands registrati.');
}

// Ready
client.once('ready', () => {
  console.log(`🤖 Bot attivo come ${client.user.tag}`);
  registerCommands();
});

// Interazioni
client.on('interactionCreate', async interaction => {
  if (interaction.type === InteractionType.ApplicationCommand && interaction.commandName === 'residenza') {
    const usernameRoblox = interaction.options.getString('username_roblox');
    const nomeRp = interaction.options.getString('nome_rp');
    const cognomeRp = interaction.options.getString('cognome_rp');
    const dataNascitaRp = interaction.options.getString('data_nascita_rp');
    const sesso = interaction.options.getString('sesso');
    const luogoNascita = interaction.options.getString('luogo_nascita');
    const nelGruppo = interaction.options.getString('nel_gruppo');

    const accountAgeDays = (new Date() - interaction.user.createdAt) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 90) {
      const canaleSegnalazioni = await client.channels.fetch(LOGS_SEGNALAZIONI_CHANNEL_ID);
      canaleSegnalazioni.send({
        content: `⚠️ L'utente <@${interaction.user.id}> ha un account giovane (${Math.floor(accountAgeDays)} giorni) e ha richiesto la residenza.`
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('Nuova richiesta di residenza')
      .setColor('#0099ff')
      .addFields(
        { name: 'Username Roblox', value: usernameRoblox, inline: true },
        { name: 'Nome RP', value: nomeRp, inline: true },
        { name: 'Cognome RP', value: cognomeRp, inline: true },
        { name: 'Data Nascita RP', value: dataNascitaRp, inline: true },
        { name: 'Sesso', value: sesso, inline: true },
        { name: 'Luogo di Nascita', value: luogoNascita, inline: true },
        { name: 'Nel gruppo Roblox', value: nelGruppo, inline: true },
        { name: 'Richiedente Discord', value: `${interaction.user.tag} (${interaction.user.id})` }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accetta_${interaction.user.id}`).setLabel('Accetta').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rifiuta_${interaction.user.id}`).setLabel('Rifiuta').setStyle(ButtonStyle.Danger)
    );

    const canaleLogs = await client.channels.fetch(LOGS_RESIDENZE_CHANNEL_ID);
    await canaleLogs.send({ embeds: [embed], components: [row] });

    await interaction.reply({ content: '✅ Richiesta inviata allo staff.', ephemeral: true });
  }

  // Accetta
  else if (interaction.isButton()) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) return interaction.reply({ content: 'Non hai il permesso.', ephemeral: true });

    const [azione, userid] = interaction.customId.split('_');
    const embed = interaction.message.embeds[0];
    const usernameRoblox = embed?.fields.find(f => f.name === 'Username Roblox')?.value || 'Sconosciuto';
    const cittadinanzeChannel = await client.channels.fetch(CITTADINANZE_CHANNEL_ID);

    if (azione === 'accetta') {
      const member = await interaction.guild.members.fetch(userid).catch(() => null);
      if (member) await member.roles.add(RUOLO_CITTADINO_ID).catch(() => null);
      if (member) await member.send(`✅ La tua richiesta di residenza è stata **Accettata**!`).catch(() => null);

      const embedEsito = new EmbedBuilder()
        .setTitle('Rimini - Esito Residenza')
        .setDescription('✅ **ACCETTATO**')
        .addFields({ name: 'Username Roblox', value: usernameRoblox })
        .setFooter({ text: `Moderatore: ${interaction.user.tag}` })
        .setTimestamp();

      await cittadinanzeChannel.send({ embeds: [embedEsito] });

      const rowDisabilitata = new ActionRowBuilder().addComponents(
        interaction.message.components[0].components.map(b => b.setDisabled(true))
      );
      await interaction.update({ components: [rowDisabilitata] });
    }

    // Rifiuta
    else if (azione === 'rifiuta') {
      const modal = new ModalBuilder().setCustomId(`modal_rifiuta_${userid}`).setTitle('Motivo del rifiuto');
      const input = new TextInputBuilder()
        .setCustomId('motivazione')
        .setLabel('Motivazione')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Inserisci il motivo del rifiuto')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }
  }

  // Modal rifiuto
  else if (interaction.isModalSubmit()) {
    const userid = interaction.customId.split('_')[2];
    const motivo = interaction.fields.getTextInputValue('motivazione');
    const logsChannel = await client.channels.fetch(LOGS_RESIDENZE_CHANNEL_ID);
    const cittadinanzeChannel = await client.channels.fetch(CITTADINANZE_CHANNEL_ID);

    const messages = await logsChannel.messages.fetch({ limit: 25 });
    const msg = messages.find(m => m.components[0]?.components.some(b => b.customId === `rifiuta_${userid}`));
    const embed = msg?.embeds[0];
    const usernameRoblox = embed?.fields.find(f => f.name === 'Username Roblox')?.value || 'Sconosciuto';

    const esitoEmbed = new EmbedBuilder()
      .setTitle('Rimini - Esito Residenza')
      .setDescription('❌ **RIFIUTATO**')
      .addFields(
        { name: 'Username Roblox', value: usernameRoblox },
        { name: 'Motivazione Rifiuto', value: motivo }
      )
      .setFooter({ text: `Moderatore: ${interaction.user.tag}` })
      .setTimestamp();

    await cittadinanzeChannel.send({ embeds: [esitoEmbed] });

    const member = await interaction.guild.members.fetch(userid).catch(() => null);
    if (member) {
      await member.send(`❌ La tua richiesta di residenza è stata **Rifiutata**.\n**Motivo:** ${motivo}`).catch(() => null);
    }

    await msg.edit({
      components: [new ActionRowBuilder().addComponents(msg.components[0].components.map(b => b.setDisabled(true)))]
    });

    await interaction.reply({ content: 'Hai rifiutato la richiesta.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);



// ——— SERVER EXPRESS (Uptime) ———
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('✅ Bot Residenza Rimini attivo!'));
app.listen(port, () => console.log(`🌐 Web server Express avviato su porta ${port}`));