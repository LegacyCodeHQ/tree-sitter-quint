import io.github.treesitter.jtreesitter.Language;
import io.github.treesitter.jtreesitter.quint.TreeSitterQuint;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

public class TreeSitterQuintTest {
    @Test
    public void testCanLoadLanguage() {
        assertDoesNotThrow(() -> new Language(TreeSitterQuint.language()));
    }
}
