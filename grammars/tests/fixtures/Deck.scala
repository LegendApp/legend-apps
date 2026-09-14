case class Deck(title: String, slides: List[String])
object Main {
  def main(args: Array[String]): Unit = {
    val deck = Deck("Hello", List("Welcome"))
    println(deck.title)
  }
}
