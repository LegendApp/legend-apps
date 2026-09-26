module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: "./android",
      },
      ios: {
        // Spark uses Expo's iOS autolinker for its macOS target.
        podspecPath: process.env.SPARK_DESKTOP_AUTOLINK === "macos"
          ? "./RNDocumentScanner.podspec" : "./ios/RNDocumentScanner.podspec",
      },
      macos: {
        podspecPath: "./RNDocumentScanner.podspec",
      },
    },
  },
};
