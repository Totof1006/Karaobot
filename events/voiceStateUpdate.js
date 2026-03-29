const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        const trainingChannels = ['Entraînement 1', 'Entraînement 2', 'Entraînement 3', 'Entraînement 4'];

        // CONDITION 1 : On ne s'occupe que des salons d'entraînement
        if (!oldState.channel || !trainingChannels.includes(oldState.channel.name)) {
            return;
        }

        // CONDITION 2 : On ne déclenche le nettoyage QUE si un humain quitte le salon
        // Si c'est le bot qui bouge ou si newState.channel est le même (mute/deaf), on ignore.
        if (oldState.member.user.bot || oldState.channelId === newState.channelId) {
            return;
        }

        // Vérification : Est-ce qu'il reste des humains dans le salon ?
        const humanMembers = oldState.channel.members.filter(m => !m.user.bot);

        if (humanMembers.size === 0) {
            try {
                // 1. Réinitialisation des permissions : on cache à nouveau le salon
                await oldState.channel.permissionOverwrites.set([
                    {
                        id: oldState.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.Connect, 
                            PermissionFlagsBits.Speak, // Ajouté pour le bot
                            PermissionFlagsBits.ManageChannels
                        ],
                    }
                ]);

                // 2. Nettoyage de la session dans la Map globale
                if (global.trainingSessions) {
                    const sessionToDelete = Array.from(global.trainingSessions.entries())
                        .find(([_, session]) => session.channelId === oldState.channelId);

                    if (sessionToDelete) {
                        const [userId, session] = sessionToDelete;
                        
                        // On déconnecte le bot proprement s'il est encore là
                        if (session.connection) {
                            session.connection.destroy();
                        }
                        
                        global.trainingSessions.delete(userId);
                        console.log(`🧹 Session nettoyée pour l'utilisateur ${userId}`);
                    }
                }

                console.log(`✅ Salon ${oldState.channel.name} réinitialisé et prêt pour le prochain !`);
            } catch (error) {
                console.error(`❌ Erreur lors du nettoyage du salon :`, error);
            }
        }
    },
};
