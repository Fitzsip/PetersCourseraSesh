package android.webkit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Compile-time stand-in: the bundled API 16 class library predates this annotation (API 17).
// It is not packaged; the device's real class is used at runtime.
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface JavascriptInterface {}
