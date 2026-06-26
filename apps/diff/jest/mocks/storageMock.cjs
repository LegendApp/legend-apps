const { observable } = require("@legendapp/state");

function normalizeFieldValue(field, value) {
  if (field.normalize) {
    return field.normalize(value);
  }
  return value === undefined || value === null ? field.defaultValue : value;
}

function createObservableSettings({ fields }) {
  const initialValue = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.defaultValue]),
  );
  const settings$ = observable(initialValue);

  return {
    field(key) {
      const fieldConfig = fields[key];
      const setting$ = settings$[key];
      return {
        get: () => normalizeFieldValue(fieldConfig, setting$.get()),
        set: (value) => {
          setting$.set(normalizeFieldValue(fieldConfig, value));
        },
        use: () => normalizeFieldValue(fieldConfig, setting$.get()),
      };
    },
    settings$,
  };
}

module.exports = {
  __esModule: true,
  createObservableSettings,
};
