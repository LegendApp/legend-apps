param([string]$Title = "Hello")
function Build-Deck {
  param([string]$Name)
  Write-Output "Building $Name"
}
Build-Deck -Name $Title
