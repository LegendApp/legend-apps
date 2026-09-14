; Local highlights for the pinned upstream node types.
(identifier) @variable
(comment) @comment
[(string_lit) (template_literal)] @string
(numeric_lit) @number
[(bool_lit) (null_lit)] @constant.builtin
(attribute (identifier) @property)
(block (identifier) @type)
(function_call (identifier) @function.call)
["for" "in" "if"] @keyword
