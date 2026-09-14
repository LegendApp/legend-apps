(ident) @variable
[(comment) (block_comment)] @comment
[(int_literal) (float_literal)] @number
(bool_literal) @constant.builtin
(type_specifier) @type
(attribute) @attribute
(function_header (ident) @function)
(call_phrase (template_elaborated_ident (ident) @function.call))
["fn" "var" "let" "const" "override" "return" "if" "else" "for" "while" "loop" "break" "struct" "alias" "enable" "requires" "discard"] @keyword
(continue_statement) @keyword
