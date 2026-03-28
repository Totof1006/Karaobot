const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        // Noms des salons à surveiller
        const trainingChannels = ['Entraînement 1', 'Entraînement 2', 'Entraînement 3', 'Entraînement 4'];

        // Cas : L'utilisateur quitte un salon
        if (oldState.channel && trainingChannels.includes(oldState.channel.name)) {
            
            // On vérifie si le salon est maintenant totalement vide (sans compter les bots)
            if (oldState.channel.members.filter(m => !m.user.bot).size === 0) {
                
                try {
                    // 1. Réinitialisation des permissions : on cache à nouveau le salon
                    await oldState.channel.permissionOverwrites.set([
                        {
                            id: oldState.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            // On s'assure que le bot garde toujours l'accès
                            id: client.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.Connect, 
                                PermissionFlagsBits.ManageChannels
                            ],
                        }
                    ]);

                    // 2. Nettoyage de la session dans la Map globale
                    if (global.trainingSessions) {
                        for (const [userId, session] of global.trainingSessions.entries()) {
                            if (session.channelId === oldState.channelId) {
                                global.trainingSessions.delete(userId);
                                console.log(`🧹 Session nettoyée pour l'utilisateur ${userId}`);
                                break;
                            }
                        }
                    }

                    console.log(`✅ Salon ${oldState.channel.name} réinitialisé et prêt pour le prochain !`);
                } catch (error) {
                    console.error(`❌ Erreur lors du nettoyage du salon :`, error);
                }
            }
        }
    },
};
