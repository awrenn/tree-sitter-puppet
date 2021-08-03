# tree-sitter-puppet

This is a tree-sitter grammar for puppet code, with `.pp` extensions.  

Mostly, this can be used like any other tree sitter grammar. The tree-sitter repo does a good job of explaining itself, found [here](https://github.com/tree-sitter/tree-sitter).  


A couple commands that might be of interest:  
  
`npm run parse` - parse the file located at `./test/test.pp`.  
  
`npm run test` - run the corpus tests.  

`./check.sh <dir>` - run the parser against a directory full of puppet files, to see how many have errors.  

