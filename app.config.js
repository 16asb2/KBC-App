const IS_DEV = process.env.APP_VARIANT === 'development';

/** @type {import('expo/config').ConfigContext} */
module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'KBC Scheduler (Dev)' : config.name,
  android: {
    ...config.android,
    package: IS_DEV ? 'com.kbcscheduler.app.dev' : config.android.package,
  },
});
