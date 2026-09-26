module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "./android",
      },
      ios: {
        // Spark uses Expo's iOS autolinker for its macOS target.
        podspecPath: process.env.SPARK_DESKTOP_AUTOLINK === "macos"
          ? "./RNMediaLibraryScanner.podspec" : "./ios/RNMediaLibraryScanner.podspec",
      },
      macos: {
        podspecPath: "./RNMediaLibraryScanner.podspec",
      },
    },
  },
};
