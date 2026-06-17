const React = require("react");

module.exports = {
  Portal: ({ children }) => React.createElement(React.Fragment, null, children),
  PortalHost: () => null,
  PortalProvider: ({ children }) => React.createElement(React.Fragment, null, children),
};
