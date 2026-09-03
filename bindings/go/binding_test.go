package tree_sitter_quint_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_quint "github.com/LegacyCodeHQ/tree-sitter-quint/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_quint.Language())
	if language == nil {
		t.Errorf("Error loading Quint grammar")
	}
}
