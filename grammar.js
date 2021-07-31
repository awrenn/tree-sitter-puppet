const PREC = {
    not: 14,
    negation: 13,
    array_splat: 12,
    binary_in: 11,
    regex: 10,
    multiplicative: 9,
    additive: 8,
    shift: 7,
    equality: 6,
    comparative: 5,
    and: 4,
    or: 3,
    assignment: -1,
    ordering: -2,
    rocket: -3, // This can't override hash literal syntax
  },
  not_operators = ["!"],
  negation_operators = ["-"],
  array_splat_operators = ["*"],
  binary_in_operators = ["in"],
  regex_operators = ["=~", "!~"],
  multiplicative_operators = ["*", "/", "%"],
  additive_operators = ["+", "-"],
  shift_operators = ["<<", ">>"],
  equality_operators = ["==", "!="],
  comparative_operators = ["<", "<=", ">", ">="],
  rocket_operators = ["=>"],
  and = ["and"],
  or = ["or"],
  assignment_operators = ["="],
  ordering_operators = ["->", "~>"],
  keywords = [
    "and",
    "application",
    "attr",
    "case",
    "component",
    "consumes",
    "default",
    "define",
    "elsif",
    "environment",
    "false",
    "function",
    "if",
    "import",
    "in",
    "inherits",
    "node",
    "or",
    "private",
    "produces",
    "regexp",
    "site",
    "true",
    "undef",
    "unit",
    "unless",
  ];

module.exports = grammar({
  name: "puppet",

  conflicts: ($) => [
    [$.case_statement, $._resource_declaration],
    [$.if_block, $._resource_declaration],
    [$.elsif_block, $._resource_declaration],
    [$.else_block, $._resource_declaration],
    [$.interpolation_identifier, $._value],
    [$._interpolation_value, $._value],
    [$._interpolation_expression, $._expression],
  ],

  externals: ($) => [
    $._heredoc_header,
    $.heredoc_trim_border,
    $.heredoc_body,
    $._heredoc_end,
    $._heredoc_end_trim,
  ],

  word: ($) => $.identifier,

  extras: ($) => [$._comment, /\s/],

  rules: {
    source_file: ($) => repeat($._statement),

    _statement: ($) =>
      prec.right(choice($._expression, $.resource_declaration)),

    keyword: ($) => token(choice(...keywords)),

    identifier: ($) =>
      token(
        choice(
          seq(
            optional(choice("$", repeat1("@"))),
            optional(token.immediate("::")),
            repeat(seq(/[a-z_][a-zA-Z0-9_]*/, token.immediate("::"))),
            /[a-z_][a-zA-Z0-9_]*/
          )
        )
      ),

    interpolation_identifier: ($) => choice($.identifier, $.keyword),

    immediate_identifier: ($) =>
      token.immediate(
        seq(
          optional("$"),
          optional(/[a-z_][a-z0-9_]*/),
          repeat(seq(token.immediate("::"), /[a-z_][a-z0-9_]*/)),
          /[a-z_][a-z0-9_]*/
        )
      ),
    lower_identifier: ($) =>
      token(
        seq(
          optional("::"),
          token.immediate(repeat1(seq(/[a-z_][a-z0-9_]*/, "::"))),
          /[a-z_][a-z0-9_]*/
        )
      ),

    capital_identifier: ($) =>
      token(
        seq(
          optional("::"),
          token.immediate(repeat(seq(/[A-Z][a-zA-Z0-9_]*/, "::"))),
          /[A-Z][a-zA-Z0-9_]*/
        )
      ),

    var_identifier: ($) =>
      token(
        seq(
          "$",
          optional(/[a-z_][a-z0-9_]*/),
          repeat(seq(token.immediate("::"), /[a-z_][a-z0-9_]*a/)),
          /[a-z_][a-z0-9_]*/
        )
      ),

    escape_sequence: ($) =>
      token.immediate(
        seq(
          "\\",
          choice(
            /[^xuU]/,
            /\d{2,3}/,
            /x[0-9a-fA-F]{2,}/,
            /u[0-9a-fA-F]{4}/,
            /U[0-9a-fA-F]{8}/
          )
        )
      ),

    _resource_title: ($) => $._value,
    type: ($) => prec.right(seq($.capital_identifier, optional($.index))),

    _number: ($) =>
      choice(
        $.integer,
        $.octal,
        $.hex_upper,
        $.hex_lower,
        $.floating_point,
        $.exp_float
      ),
    integer: ($) => /[0-9]+/,

    floating_point: ($) =>
      token(seq(/[0-9]+/, token.immediate("."), token.immediate(/[0-9]+/))),
    exp_float: ($) =>
      token(seq(/[0-9]+/, token.immediate("e"), token.immediate(/[0-9]+/))),
    octal: ($) => token(seq("0o", token.immediate(/[0-8]+/))),
    hex_lower: ($) => token(seq("0x", token.immediate(/[0-9a-fA-F]+/))),
    hex_upper: ($) => token(seq("0X", token.immediate(/[0-9a-fA-F]+/))),

    interpolation_expression: ($) =>
      choice(seq("${", choice($._interpolation_expression), "}")),

    _string_body: ($) =>
      repeat1(
        choice(
          $.interpolation_expression,
          /\$[^{]/,
          token.immediate(/[^"\\$]+/),
          $.escape_sequence
        )
      ),
    _fixed_string_body: ($) =>
      repeat1(choice(token.immediate(/[^'\\]+/), $.escape_sequence)),

    string: ($) =>
      choice(
        seq('"', optional($._string_body), '"'),
        seq("'", optional($._fixed_string_body), "'")
      ),

    regex: ($) =>
      token(
        prec.left(
          seq(
            "/",
            repeat(choice(token.immediate(/[^\/\n]/), token.immediate("\\/"))),
            "/"
          )
        )
      ),

    array: ($) =>
      seq(
        "[",
        optional(
          seq(repeat(seq($._statement, ",")), $._statement, optional(","))
        ),
        "]"
      ),

    hash_pair: ($) => seq($._expression, "=>", $._expression),
    hash: ($) =>
      seq(
        "{",
        optional(
          seq(repeat(seq($.hash_pair, ",")), $.hash_pair, optional(","))
        ),
        "}"
      ),
    bool: ($) => choice("true", "false"),
    undef: ($) => "undef",

    // This syntax is...
    // Keywords can only be used as identifiers in an interpolation context
    // TODO acwrenn
    // We need to replace all the expression components with ones where we can use keywords as identifiers
    _interpolation_expression: ($) =>
      prec.right(
        choice(
          prec(
            3,
            seq($._interpolation_expression, choice($.call, $.field, $.index))
          ),
          prec.right(
            1,
            choice(
              $.binary_expression,
              $._interpolation_value,
              $._wrapped_expression,
              $.include,
              $.case_statement,
              $.if_statement,
              $.unless_statement,
              $.unary_expression,
              $._heredoc,
              $.class_definition,
              $.resource_collector,
              $.exported_resource_collector
            )
          )
        )
      ),

    _expression: ($) =>
      prec.right(
        choice(
          prec(3, seq($._expression, choice($.call, $.field, $.index))),
          prec.right(
            1,
            choice(
              $.binary_expression,
              $._value,
              $._wrapped_expression,
              $.include,
              $.case_statement,
              $.if_statement,
              $.unless_statement,
              $.unary_expression,
              $._heredoc,
              $.class_definition,
              $.resource_collector,
              $.exported_resource_collector
            )
          )
        )
      ),

    _wrapped_expression: ($) => seq("(", $._statement, ")"),

    _resource_binary_expression: ($) =>
      prec.right(
        PREC.ordering,
        seq($._statement, choice(...ordering_operators), $._statement)
      ),

    _binary_expression: ($) => {
      const table = [
        [PREC.binary_in, choice(...binary_in_operators)],
        [PREC.regex, choice(...regex_operators)],
        [PREC.multiplicative, choice(...multiplicative_operators)],
        [PREC.shift, choice(...shift_operators)],
        [PREC.additive, choice(...additive_operators)],
        [PREC.equality, choice(...equality_operators)],
        [PREC.comparative, choice(...comparative_operators)],
        [PREC.and, choice(...and)],
        [PREC.or, choice(...or)],
        [PREC.rocket, choice(...rocket_operators)],
        [PREC.assignment, choice(...assignment_operators)],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.right(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression)
            )
          )
        )
      );
    },
    binary_expression: ($) =>
      choice($._binary_expression, $._resource_binary_expression),

    unary_expression: ($) => {
      const table = [
        [PREC.not, choice(...not_operators)],
        [PREC.negation, choice(...negation_operators)],
        [PREC.array_splat, choice(...array_splat_operators)],
      ];

      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(
            precedence,
            seq(field("operator", operator), field("operand", $._expression))
          )
        )
      );
    },

    index: ($) =>
      prec.left(
        seq(
          token.immediate("["),
          repeat(seq($._expression, ",")),
          $._expression,
          optional(","),
          "]"
        )
      ),

    field: ($) => prec.left(seq(".", $.immediate_identifier)),

    question_switch: ($) => seq($._expression, "?", $.hash),

    // I'll say it again - string interpolation syntax is not fun here.
    // Exactly the same, but we can use keywords as identifiers
    _interpolation_value: ($) =>
      prec.right(
        choice(
          $._number,
          $.string,
          $.bool,
          $.undef,
          $.regex,
          $.array,
          $.hash,
          $.question_switch,
          $.type,
          $.interpolation_identifier
        )
      ),

    _value: ($) =>
      prec.right(
        choice(
          $._number,
          $.string,
          $.bool,
          $.undef,
          $.regex,
          $.array,
          $.hash,
          $.question_switch,
          $.type,
          $.identifier
        )
      ),

    default_param_value: ($) => seq("=", prec(4, $._expression)),
    parameter: ($) =>
      seq(optional($.type), $.identifier, optional($.default_param_value)),

    parameter_list: ($) =>
      seq(repeat(seq($.parameter, ",")), $.parameter, optional(",")),

    standard_parameter_list: ($) => seq("(", optional($.parameter_list), ")"),

    class_definition_block: ($) =>
      seq("{", repeat(prec.right($._statement)), "}"),

    inherits_statement: ($) => seq("inherits", $.identifier),

    class_definition: ($) =>
      seq(
        field("type", choice("class", "define")),
        $.identifier,
        optional($.standard_parameter_list),
        optional($.inherits_statement),
        $.class_definition_block
      ),

    resource_attribute: ($) =>
      seq(
        field("key", choice("*", $.identifier)),
        field("operator", choice("=>", "+>")), // surprise operator
        field("value", $._expression),
        optional(",")
      ),
    resource_config: ($) =>
      seq($._expression, ":", repeat($.resource_attribute)),
    resource_block: ($) =>
      choice(
        repeat1($.resource_attribute),
        seq(
          repeat(seq($.resource_config, ";")),
          $.resource_config,
          optional(";")
        )
      ),

    _resource_declaration: ($) =>
      prec.right(
        seq(
          choice($._expression, $.type, "class"),
          seq("{", optional($.resource_block), "}")
        )
      ),

    resource_declaration: ($) =>
      field("resource", prec.right($._resource_declaration)),

    include: ($) => seq("include", $.identifier),

    lambda: ($) =>
      seq(
        "|",
        $.parameter_list,
        "|",
        "{",
        optional(repeat(prec.right($._statement))),
        "}"
      ),

    function_parameters: ($) =>
      seq(repeat(seq($._expression, ",")), $._expression, optional(",")),

    call: ($) =>
      // Use right prec to grab lambdas during the call, not as a seperate call
      prec.right(
        seq(
          choice(
            // Some functions allow for no parens, like $foo.each |$baz| {}
            // We need to have either the func($a) syntax, or the above no-params syntax.
            // Each are optional, but at least one must be used
            seq(
              "(",
              field("params", optional($.function_parameters)),
              ")",
              field("lambda", optional($.lambda))
            ),
            field("lambda", $.lambda)
          )
        )
      ),

    // https://puppet.com/docs/puppet/6/lang_collectors.html
    // The collector expression syntax is special :shrug:
    _or: ($) => "or",
    _and: ($) => "and",
    eq: ($) => "==",
    ne: ($) => "!=",
    collector_match_expression: ($) =>
      seq(
        field("field", $.identifier),
        field("operator", choice($.eq, $.ne)),
        field(
          "key",
          choice($.string, $.bool, $._number, $.type, $.undef, $.identifier)
        )
      ),
    collector_expression: ($) =>
      prec.right(
        choice(
          seq(
            $.collector_expression,
            field("operator", choice(prec(1, $._and), $._or)),
            $.collector_expression
          ),
          $.collector_match_expression
        )
      ),
    exported_resource_collector: ($) =>
      seq($.type, "<<|", optional($.collector_expression), "|>>"),
    resource_collector: ($) =>
      seq($.type, "<|", optional($.collector_expression), "|>"),
    _comment: ($) => token(prec(-10, /#[^\n]*/)),

    // Take if and elsif blocks over resource definitions
    if_block: ($) =>
      prec.right(10, seq("if", $._expression, "{", repeat($._statement), "}")),
    elsif_block: ($) =>
      prec.right(
        10,
        seq("elsif", $._expression, "{", repeat($._statement), "}")
      ),
    else_block: ($) =>
      prec.right(10, seq("else", "{", repeat($._statement), "}")),

    if_statement: ($) =>
      prec.right(
        seq($.if_block, repeat($.elsif_block), optional($.else_block))
      ),

    unless_block: ($) =>
      prec.right(
        10,
        seq("unless", $._expression, "{", repeat($._statement), "}")
      ),

    unless_statement: ($) => seq($.unless_block, optional($.else_block)),

    case_statement: ($) =>
      prec.right(
        seq(
          "case",
          $._expression,
          "{",
          repeat(
            seq(
              field(
                "case_match_expressions",
                seq(repeat(seq($._expression, ",")), $._expression)
              ),
              ":",
              "{",
              field("case_block", repeat($._statement)),
              "}"
            )
          ),
          "}"
        )
      ),

    heredoc_switches: ($) =>
      seq("/", repeat(choice("$", "n", "r", "t", "s", "L", "u"))),
    heredoc_syntax: ($) => seq(":", /[^)]+/),

    heredoc_interpolate: ($) =>
      seq(
        "@(",
        '"',
        $._heredoc_header,
        '"',
        optional(choice($.heredoc_switches, $.heredoc_syntax)),
        ")",
        optional($.heredoc_body),
        $.heredoc_trim_border,
        choice($._heredoc_end, $._heredoc_end_trim)
      ),

    heredoc_fixed: ($) =>
      seq(
        "@(",
        $._heredoc_header,
        optional(choice($.heredoc_switches, $.heredoc_syntax)),
        ")",
        optional($.heredoc_body),
        $.heredoc_trim_border,
        choice($._heredoc_end, $._heredoc_end_trim)
      ),

    _heredoc: ($) => choice($.heredoc_fixed, $.heredoc_interpolate),
  },
});
