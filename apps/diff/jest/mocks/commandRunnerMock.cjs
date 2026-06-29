function createMockCommandRunner({ availability = {}, run } = {}) {
  return {
    async getAvailability(commands) {
      return Object.fromEntries(commands.map((command) => [command, Boolean(availability[command])]));
    },
    async runCommand(params) {
      if (run) {
        return run(params);
      }
      return {
        exitCode: 0,
        stderr: "",
        stdout: params.input ?? params.args?.join(" ") ?? "",
        timedOut: false,
      };
    },
  };
}

module.exports = {
  __esModule: true,
  commandRunner: createMockCommandRunner(),
  createMockCommandRunner,
};
