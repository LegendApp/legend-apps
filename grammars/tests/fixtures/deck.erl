-module(deck).
-export([title/1]).
title(Name) ->
    io_lib:format("Deck: ~s", [Name]).
