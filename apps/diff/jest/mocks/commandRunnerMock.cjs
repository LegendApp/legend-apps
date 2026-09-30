module.exports = {
 runCommand: jest.fn(async () => ({ exit: { type: "exited", code: 0 }, stdout: new Uint8Array(), stderr: new Uint8Array(), timedOut: false })),
 resolveCommand: jest.fn(async name => ({ type: "executable", path: `/usr/bin/${name}` })),
};
