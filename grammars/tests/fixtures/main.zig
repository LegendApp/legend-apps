const std = @import("std");
pub fn main() void {
    const title = "Hello";
    std.debug.print("{s}\n", .{title});
}
