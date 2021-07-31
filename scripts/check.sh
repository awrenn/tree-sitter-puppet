#!/bin/bash

function check_dir() {
  d=$1
  test_files=$(find $d -name "*.pp")

  tree-sitter generate

  total=0
  missed=0
  lines=0
  rm missed_files.txt
  for f in $test_files; do
    total=$(($total + 1))
    l=$(cat $f | wc -l)
    lines=$(($lines + $l))
    output=$(time tree-sitter parse $f)
    if [ $? -ne 0 ]; then
      echo "$output"
      missed=$(($missed + 1))
      echo $f >> missed_files.txt
    fi
  done
  echo "Total: $total"
  echo "Lines: $lines"
  echo "Missed: $missed"

  echo "Parsing $total files..."

  time tree-sitter parse $test_files > /dev/null
}

check_dir $1
