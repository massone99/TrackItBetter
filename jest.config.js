// Expo's lazy native fetch getter can be evaluated by Jest while disposing globals.
// Use the React Native fetch mock throughout tests, before the Expo preset initializes.
process.env.EXPO_PUBLIC_USE_RN_FETCH = "1";

module.exports = {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
};
