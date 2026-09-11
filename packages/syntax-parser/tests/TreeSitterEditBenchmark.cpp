#include "../cpp/TreeSitterHighlighter.hpp"
#include <algorithm>
#include <cassert>
#include <chrono>
#include <codecvt>
#include <fstream>
#include <iostream>
#include <locale>
#include <sstream>
#include <unistd.h>
using namespace margelo::nitro::legendapps::syntaxparser;
using Clock = std::chrono::steady_clock;
template<class F> double timeMs(F f) { auto a=Clock::now(); f(); return std::chrono::duration<double,std::milli>(Clock::now()-a).count(); }
TreeSitterPoint point(const std::u16string& s, size_t o) { TreeSitterPoint p{}; for(size_t i=0;i<o;++i) {if(s[i]=='\n') {++p.row;p.column=0;} else ++p.column;} return p; }
double median(std::vector<double> a) {std::sort(a.begin(),a.end());return a[a.size()/2];}
int main(int argc,char** argv) {
  assert(argc>=5);
  std::string shape=argv[1],location=argv[3],kind=argv[4]; size_t n=std::stoul(argv[2]);
  std::u16string s; std::vector<size_t> starts;
  std::wstring_convert<std::codecvt_utf8_utf16<char16_t>,char16_t> codec;
  if(shape=="file") {std::ifstream f(argv[5]);std::ostringstream b;b<<f.rdbuf();s=codec.from_bytes(b.str());}
  else for(size_t i=0;i<n;++i) {
    if(shape=="nested"&&i%100==0) s+=codec.from_bytes("function group"+std::to_string(i/100)+"() {\n");
    s+=codec.from_bytes("const value"+std::to_string(i)+": number = 42; // marker\n");
    if(shape=="nested"&&i%100==99) s+=u"}\n";
  }
  for(size_t i=0;i<s.size();++i) if(i==0||s[i-1]=='\n')starts.push_back(i);
  size_t row=location=="start"?std::min<size_t>(10,starts.size()-1):location=="end"?starts.size()-2:starts.size()/2;
  size_t offset=starts[row];
  if(shape!="file") {offset=s.find(u"marker",offset); if(offset==s.npos)offset=s.rfind(u"marker");}
  else {while(offset<s.size()&&!((s[offset]>='a'&&s[offset]<='z')||(s[offset]>='A'&&s[offset]<='Z')))++offset;}
  if(offset>=s.size()) {offset=s.size()-1;while(offset>0&&!((s[offset]>='a'&&s[offset]<='z')||(s[offset]>='A'&&s[offset]<='Z')))--offset;}
  if(kind=="comment") offset=starts[row]; // open a block comment before code, not inside an existing // comment
  assert(offset<s.size());
  const auto saved=s;
  TreeSitterHighlighter h(shape=="file"?"tsx":"typescript");
  TreeSitterInput input{(uint32_t)s.size(),[&](uint32_t o){return std::u16string_view(s).substr(o,4096);}};
  size_t reads=0;input.read=[&](uint32_t o){++reads;return std::u16string_view(s).substr(o,4096);};
  double initial=timeMs([&]{assert(h.parse(input));});
  std::vector<double> edit,parse,query;size_t readTotal=0;
  int iterations=kind=="profile"?600:20;
  std::cerr<<"pid="<<getpid()<<" initial="<<initial<<"\n";
  for(int i=0;i<iterations;++i) {
    const size_t removed=(kind=="local"||kind=="profile")?1:(i%2?(kind=="newline"?1:2):0);
    const auto inserted=(kind=="local"||kind=="profile")?std::u16string(1,i%2?saved[offset]:u'x'):
      i%2?u"":kind=="newline"?u"\n":u"/*";
    auto p=point(s,offset),oldp=point(s,offset+removed);
    s.replace(offset,removed,inserted); input.length=s.size();
    auto newp=point(s,offset+inserted.size());
    reads=0;
    edit.push_back(timeMs([&]{h.edit({(uint32_t)offset,(uint32_t)(offset+removed),(uint32_t)(offset+inserted.size()),p,oldp,newp});}));
    parse.push_back(timeMs([&]{assert(h.parse(input));}));readTotal+=reads;
    size_t end=offset;int lines=0;while(end<s.size()&&lines<80)if(s[end++]=='\n')++lines;
    query.push_back(timeMs([&]{auto spans=h.highlight(offset,end);(void)spans;}));
  }
  // Final local edit/undo restores exactly the original; compare to a fresh tree.
  assert(s==saved);
  TreeSitterHighlighter fresh(shape=="file"?"tsx":"typescript"); assert(fresh.parse(input));
  auto a=h.highlight(0,s.size()),b=fresh.highlight(0,s.size());assert(a.size()==b.size());
  for(size_t i=0;i<a.size();++i)assert(a[i].start==b[i].start&&a[i].length==b[i].length&&a[i].capture==b[i].capture);
  std::cout<<"{\"shape\":\""<<shape<<"\",\"lines\":"<<starts.size()<<",\"location\":\""<<location<<"\",\"kind\":\""<<kind<<"\",\"initial_ms\":"<<initial
   <<",\"edit_ms\":"<<median(edit)<<",\"parse_ms\":"<<median(parse)<<",\"query_ms\":"<<median(query)<<",\"reads_per_edit\":"<<(double)readTotal/iterations<<"}\n";
}
