from pathlib import Path
import base64, hashlib, json, os, shutil, subprocess, tempfile

dist = Path("dist")
dist.mkdir(exist_ok=True)
source = Path("android/app/build/outputs/bundle/release/app-release.aab")
unsigned = dist / "halka-arz-portfoyum-v2.4.6-code28-unsigned.aab"
shutil.copyfile(source, unsigned)
status = {"versionName":"2.4.6", "versionCode":28, "package":"com.innative.halkaarz", "commit":os.environ.get("GITHUB_SHA"), "signed":False}
required = ["PLAY_UPLOAD_KEYSTORE_BASE64","PLAY_UPLOAD_KEYSTORE_PASSWORD","PLAY_UPLOAD_KEY_PASSWORD"]
expected = "02d9f298a56b63ec9067b911fc898907b6fdfc4e059143d88f0b9df24022a272"
if all(os.environ.get(k) for k in required):
    with tempfile.TemporaryDirectory() as folder:
        key = Path(folder) / "upload.jks"
        key.write_bytes(base64.b64decode(os.environ["PLAY_UPLOAD_KEYSTORE_BASE64"], validate=True))
        key.chmod(0o600)
        alias = os.environ.get("PLAY_UPLOAD_KEY_ALIAS") or "halkaarz-upload"
        cert = subprocess.check_output(["keytool","-exportcert","-keystore",str(key),"-alias",alias,"-storepass:env","PLAY_UPLOAD_KEYSTORE_PASSWORD"],stderr=subprocess.DEVNULL)
        if hashlib.sha256(cert).hexdigest() != expected:
            raise SystemExit("Configured upload certificate does not match the previous Play release.")
        signed = dist / "halka-arz-portfoyum-v2.4.6-code28-play.aab"
        subprocess.run(["jarsigner","-keystore",str(key),"-storepass:env","PLAY_UPLOAD_KEYSTORE_PASSWORD","-keypass:env","PLAY_UPLOAD_KEY_PASSWORD","-sigalg","SHA256withRSA","-digestalg","SHA-256","-signedjar",str(signed),str(unsigned),alias],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(["jarsigner","-verify",str(signed)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        status.update(signed=True,certificateSha256=expected,sha256=hashlib.sha256(signed.read_bytes()).hexdigest())
        unsigned.unlink()
else:
    status["remaining"] = "Release compiled; existing upload key is required to complete Play signing."
    status["sha256"] = hashlib.sha256(unsigned.read_bytes()).hexdigest()
(dist / "BUILD_STATUS.json").write_text(json.dumps(status,indent=2)+"\n")
print(json.dumps(status))
