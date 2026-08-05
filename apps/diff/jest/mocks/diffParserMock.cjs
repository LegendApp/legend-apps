const React = require("react");
const { View } = require("react-native");

const DiffNativeRow = React.memo(function DiffNativeRow(props) {
  return React.createElement(View, props);
});

const DiffHorizontalScroller = React.memo(function DiffHorizontalScroller(props) {
  return React.createElement(View, props);
});

const DiffNativeRowConfig = React.memo(function DiffNativeRowConfig(props) {
  return React.createElement(View, props);
});

const DiffMergeNativePane = React.memo(function DiffMergeNativePane(props) {
  return React.createElement(View, props);
});

module.exports = {
  __esModule: true,
  DiffHorizontalScroller,
  DiffMergeNativePane,
  DiffNativeRow,
  DiffNativeRowConfig,
  loadGitFolderDiff: jest.fn(),
  loadUnifiedDiff: jest.fn(),
  loadUnifiedDiffFromUrl: jest.fn(),
  startGitFolderDiff: jest.fn(),
};
