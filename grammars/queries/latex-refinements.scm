; Local highlights for the pinned upstream node types.
[(line_comment) (block_comment)] @comment
(command_name) @function
(_ command: _ @function)
[(label) (path) (uri)] @string
[(section text: (_) @markup.heading) (subsection text: (_) @markup.heading)
 (chapter text: (_) @markup.heading) (title_declaration text: (_) @markup.heading)]
(operator) @operator
[(superscript) (subscript)] @markup.math
