#!/usr/bin/env perl
use strict;
use warnings;
my $title = "Hello";
sub label {
    my ($name) = @_;
    return "Deck: $name";
}
print label($title);
