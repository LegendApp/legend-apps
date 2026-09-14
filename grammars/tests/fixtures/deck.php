<?php
final class Deck {
    public function __construct(public string $title) {}
    public function label(): string {
        return "Deck: " . $this->title;
    }
}
