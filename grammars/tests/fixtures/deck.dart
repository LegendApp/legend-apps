class Deck {
  final String title;
  Deck(this.title);
  String label() => 'Deck: $title';
}
void main() {
  print(Deck('Hello').label());
}
