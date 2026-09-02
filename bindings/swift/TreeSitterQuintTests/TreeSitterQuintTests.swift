import XCTest
import SwiftTreeSitter
import TreeSitterQuint

final class TreeSitterQuintTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_quint())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Quint grammar")
    }
}
