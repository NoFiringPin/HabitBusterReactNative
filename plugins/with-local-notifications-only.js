const { withEntitlementsPlist } = require('expo/config-plugins');

// HabitBuster schedules notifications on the device and does not use APNs.
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (updatedConfig) => {
    delete updatedConfig.modResults['aps-environment'];
    return updatedConfig;
  });
};
