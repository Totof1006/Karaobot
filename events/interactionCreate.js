const { EmbedBuilder } = require('discord.js');
const {
    getSession, addPlayer, getCurrentSinger,
    getSongTitle,
    addVote, advanceToNextSinger,
    deleteSession, shufflePlayers,
} = require('../utils/gameState');
const {
    registrationEmbed, votingEmbed, errorEmbed, successEmbed,
} = require('../utils/embeds');
const { joinButton, startButton, voteButtons } = require('../utils/buttons');

// IMPORT CORRIGÉ : Ajout de formatDate et setPlayerSongs
const { 
    getEvent, registerPlayer, unregisterPlayer, 
    isRegistrationOpen, formatDate, setPlayerSongs 
} = require('../utils/eventDB');

const { refreshAnnouncement, showRegistrationModal, handleModalSubmit } = require('../commands/inscrire');
const {
    assignSpectatorRole, removeKaraokeRoles,
    ROLE_LEADER, ROLE_MODO, hasRole,
} = require('../utils/roleManager');
const {
    findVoiceChannel, unmuteSingersOnly,
} = require('../utils/voiceManager');
const { checkAnnouncementButton, checkCommandChannel } = require('../utils/channelGuard');
const { launchFromEvent } = require('../commands/lancer-evenement');
const { playLocalAudio } = require('../utils/audioPlayer');
const { startBreakThenSing, revealResults, endSession } = require('../utils/sessionFlow');
const { updateProgressEmbed } = require('../utils/progressEmbed');
const { VOTE_DURATION_MS, APPLAUSE_FILE, MAX_SINGERS } = require('../utils/constants');

// --- FONCTIONS UTILITAIRES POUR LA VÉRIFICATION ---

async function getAudioDuration(url) {
    const ffmpeg = require('fluent-ffmpeg');
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(0), 5000);
        ffmpeg.ffprobe(url, (err, metadata) => {
            clearTimeout(timeout);
            if (err || !metadata) return resolve(0);
            resolve(metadata.format.duration || 0);
        });
    });
}

const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

// --- MODULE PRINCIPAL ---

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ── Slash commands ──────────────────────────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (err) {
                console.error(err);
                const msg = { embeds: [errorEmbed('Une erreur est survenue.')], ephemeral: true };
                if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
                else await interaction.reply(msg);
            }
            return;
        }

        // ── Modals ──────────────────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId === 'modal_register_songs') {
                    const guard = checkCommandChannel(interaction);
                    if (!guard.ok) {
                        return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                    }
                    await handleModalSubmit(interaction);
                }
            } catch (err) {
                console.error('[Modal]', err);
                const msg = { embeds: [errorEmbed('Une erreur est survenue lors du traitement du formulaire.')], ephemeral: true };
                if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => { });
                else await interaction.reply(msg).catch(() => { });
            }
            return;
        }

        // ── Buttons ─────────────────────────────────────────────────────────────
        if (!interaction.isButton()) return;

        const session = getSession(interaction.guildId);
        const { customId, user } = interaction;

        try {
            // ── BOUTON VÉRIFICATION DE VERSION (Nouveau système) ─────────────────
            if (customId.startsWith('verify_song_')) {
                await interaction.deferUpdate();

                const songIndex = parseInt(customId.split('_')[2]);
                const event = getEvent(interaction.guildId);
                const registration = event?.registrations.find(r => r.userId === user.id);
                const song = registration?.songs[songIndex];

                if (!song || !song.url) {
                    return interaction.followUp({ content: "❌ Impossible de retrouver les données de cette chanson.", ephemeral: true });
                }

                const youtubeDuration = await getAudioDuration(song.url);
                const apiDuration = song.apiDuration || 0;
                const diff = Math.abs(youtubeDuration - apiDuration);
                const isMatch = diff < 30;

                const embed = new EmbedBuilder()
                    .setTitle(`🔍 Rapport : ${song.title}`)
                    .setColor(isMatch ? 0x57F287 : 0xED4245)
                    .addFields(
                        { name: '⏱️ Paroles (API)', value: formatTime(apiDuration), inline: true },
                        { name: '📺 Vidéo (YouTube)', value: youtubeDuration > 0 ? formatTime(youtubeDuration) : 'Incalculable', inline: true },
                        { name: '📊 Verdict', value: isMatch ? '✅ **Correspondance validée !**' : `⚠️ **Écart de ${Math.round(diff)}s détecté.**` }
                    )
                    .setFooter({ text: "Vérifie que ta vidéo ne contient pas d'intro trop longue." });

                return interaction.followUp({ embeds: [embed], ephemeral: true });
            }

            // ── BOUTON S'INSCRIRE chanteur → ouvre le modal ──────────────────────────
            if (customId === 'event_register') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) {
                    return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                }
                await showRegistrationModal(interaction);
                return;
            }

            // ── BOUTON SPECTATEUR (message d'annonce) ────────────────────────────────
            if (customId === 'event_spectator') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) {
                    return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                }
                const event = getEvent(interaction.guildId);
                if (!event) {
                    return interaction.reply({ embeds: [errorEmbed('Aucun événement en cours.')], ephemeral: true });
                }
                const isRegistered = event.registrations.find(r => r.userId === user.id);
                if (isRegistered) {
                    return interaction.reply({
                        embeds: [errorEmbed('Tu es déjà inscrit(e) comme **chanteur** !')],
                        ephemeral: true,
                    });
                }
                await assignSpectatorRole(interaction.guild, user.id);
                return interaction.reply({
                    embeds: [successEmbed(`Tu as rejoint **${event.title}** en tant que 👁️ **spectateur** !`)],
                    ephemeral: true,
                });
            }

            // ── BOUTON SE DÉSINSCRIRE (message d'annonce) ────────────────────────────
            if (customId === 'event_unregister') {
                const guard = checkAnnouncementButton(interaction);
                if (!guard.ok) {
                    return interaction.reply({ embeds: [errorEmbed(guard.reason)], ephemeral: true });
                }
                const event = getEvent(interaction.guildId);
                if (!event || !isRegistrationOpen(event)) {
                    return interaction.reply({ embeds: [errorEmbed('Désinscription impossible actuellement.')], ephemeral: true });
                }
                const ok = unregisterPlayer(interaction.guildId, user.id);
                if (!ok) {
                    return interaction.reply({ embeds: [errorEmbed('Tu n\'étais pas inscrit(e).')], ephemeral: true });
                }
                await removeKaraokeRoles(interaction.guild, user.id);
                await refreshAnnouncement(interaction, interaction.guildId);
                return interaction.reply({ embeds: [successEmbed('Désinscription réussie.')], ephemeral: true });
            }

            // ── REJOINDRE ────────────────────────────────────────────────────────────
            if (customId === 'karaoke_join') {
                if (!session || session.phase !== 'registration') {
                    return interaction.reply({ embeds: [errorEmbed('Aucune session ouverte.')], ephemeral: true });
                }
                const ok = addPlayer(session, user.id, user.username);
                if (!ok) return interaction.reply({ embeds: [errorEmbed('Inscription impossible.')], ephemeral: true });
                await interaction.update({
                    embeds: [registrationEmbed(session)],
                    components: [joinButton(), startButton()],
                });
                return;
            }

            // ── LANCER ÉVÉNEMENT ─────────────────────────────────────────────────────
            if (customId === 'force_launch_event') {
                const isLeader = hasRole(interaction.member, ROLE_LEADER);
                const isModo = hasRole(interaction.member, ROLE_MODO);
                if (!isLeader && !isModo) return interaction.reply({ embeds: [errorEmbed('Accès refusé.')], ephemeral: true });
                const ev = getEvent(interaction.guildId);
                if (!ev) return interaction.reply({ embeds: [errorEmbed('Événement introuvable.')], ephemeral: true });
                await interaction.update({ components: [] });
                await launchFromEvent(interaction, ev);
                return;
            }

            // ── ANNULER ──────────────────────────────────────────────────────────────
            if (customId === 'karaoke_cancel') {
                const isLeader = hasRole(interaction.member, ROLE_LEADER);
                const isModo = hasRole(interaction.member, ROLE_MODO);
                if (!session || (!isLeader && !isModo && session.hostId !== user.id)) {
                    return interaction.reply({ embeds: [errorEmbed('Accès refusé.')], ephemeral: true });
                }
                deleteSession(interaction.guildId);
                await interaction.update({ embeds: [errorEmbed('Session annulée.')], components: [] });
                return;
            }

            // ── LANCER ───────────────────────────────────────────────────────────────
            if (customId === 'karaoke_start') {
                if (!session || session.hostId !== user.id) return interaction.reply({ embeds: [errorEmbed('Seul l\'hôte peut lancer.')], ephemeral: true });
                if (session.players.length < 2) return interaction.reply({ embeds: [errorEmbed('Il faut 2 joueurs min.')], ephemeral: true });
                session.phase = 'singing';
                if (!session.isRematch) shufflePlayers(session);
                await startBreakThenSing(interaction, session, true);
                return;
            }

            // ── VOTE ─────────────────────────────────────────────────────────────────
            if (customId.startsWith('vote_')) {
                if (!session || session.phase !== 'voting') return interaction.reply({ embeds: [errorEmbed('Aucun vote.')], ephemeral: true });
                if (session.votes.has(user.id)) return interaction.reply({ embeds: [errorEmbed('Déjà voté !')], ephemeral: true });
                if (getCurrentSinger(session)?.userId === user.id) return interaction.reply({ embeds: [errorEmbed('Vote impossible pour soi.')], ephemeral: true });

                const value = parseInt(customId.split('_')[1]);
                addVote(session, user.id, value);
                await interaction.reply({ embeds: [successEmbed(`Vote : **${value} ⭐**`)], ephemeral: true });
                await updateProgressEmbed(session, interaction.guild);

                const eligibleVoters = session.players.filter(p => p.userId !== getCurrentSinger(session)?.userId).length;
                if (session.votes.size >= eligibleVoters) {
                    if (session.voteTimerHandle) clearTimeout(session.voteTimerHandle);
                    session.phase = 'results';
                    await revealResults({ channel: interaction.channel, guild: interaction.guild }, session);
                }
                return;
            }

            // ── FIN DE CHANSON ───────────────────────────────────────────────────────
            if (customId === 'karaoke_end_song') {
                if (!session || session.hostId !== user.id || session.phase !== 'singing') return interaction.reply({ embeds: [errorEmbed('Action impossible.')], ephemeral: true });

                const singer = getCurrentSinger(session);
                const song = session.currentSong;
                await interaction.update({ components: [] });

                if (session.stopLyrics) session.stopLyrics();
                if (session.stopAudio) session.stopAudio();
                if (session.stopAmbient) session.stopAmbient();

                session.phase = 'voting';
                const voteMsg = await interaction.channel.send({
                    embeds: [votingEmbed(singer, getSongTitle(song))],
                    components: [voteButtons()],
                });
                session.voteMessage = voteMsg;

                const voiceChannel = await findVoiceChannel(interaction.guild);
                if (voiceChannel) {
                    session.stopAmbient = await playLocalAudio(voiceChannel, APPLAUSE_FILE, () => { session.stopAmbient = null; });
                }

                session.voteTimerHandle = setTimeout(async () => {
                    if (getSession(interaction.guildId)?.phase !== 'voting') return;
                    await revealResults({ channel: interaction.channel, guild: interaction.guild }, session);
                }, VOTE_DURATION_MS);
                return;
            }

            // ── SUIVANT ───────────────────────────────────────────────────────────────
            if (customId === 'karaoke_next') {
                if (!session || session.hostId !== user.id) return interaction.reply({ embeds: [errorEmbed('Action refusée.')], ephemeral: true });
                await interaction.update({ components: [] });
                const hasNext = advanceToNextSinger(session);
                if (!hasNext) {
                    await endSession(interaction, session);
                } else if (session.paused) {
                    session.phase = 'paused';
                    const voiceChannel = await findVoiceChannel(interaction.guild);
                    if (voiceChannel) await unmuteSingersOnly(interaction.guild, voiceChannel, session.players.map(p => p.userId));
                    await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0xFF9900).setTitle('⏸️ Pause').setDescription('Session en pause. Les micros chanteurs sont ouverts.')] });
                } else {
                    await startBreakThenSing(interaction, session, false);
                }
                return;
            }

        } catch (err) {
            console.error('[Button]', customId, err);
            const msg = { embeds: [errorEmbed('Une erreur est survenue.')], ephemeral: true };
            if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => { });
            else await interaction.reply(msg).catch(() => { });
        }
    },
};
