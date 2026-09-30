module.exports = { randomBase64Url: jest.fn(length => "A".repeat(Math.ceil(length * 4 / 3))) };
