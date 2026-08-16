const React = require("react");
const { View } = require("react-native");

function SidebarSplitView(props) {
  return React.createElement(View, props, props.children);
}

module.exports = {
  __esModule: true,
  createSidebarSplitViewTitlebarChrome: (options) => options,
  sidebarSplitViewTitlebarMetrics: {
    contentInsetTop: 52,
    sidebarInsetTop: 42,
  },
  SidebarSplitView,
};
