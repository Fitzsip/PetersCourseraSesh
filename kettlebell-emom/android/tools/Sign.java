import com.android.apksig.ApkSigner;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Signs an APK with an APK Signature Scheme v2 signature. Usage: Sign <keystore> <alias> <password> <in.apk> <out.apk> */
public class Sign {
    public static void main(String[] a) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[0])) { ks.load(in, a[2].toCharArray()); }
        PrivateKey key = (PrivateKey) ks.getKey(a[1], a[2].toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[1]);
        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder(
                "pinkbell", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(signer))
                .setInputApk(new File(a[3]))
                .setOutputApk(new File(a[4]))
                .setMinSdkVersion(24)
                .setV1SigningEnabled(false) // v1 is only needed below Android 7 (API 24)
                .setV2SigningEnabled(true)
                .build()
                .sign();
    }
}
