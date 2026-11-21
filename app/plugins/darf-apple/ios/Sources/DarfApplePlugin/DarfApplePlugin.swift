import Foundation
import Capacitor
import AuthenticationServices

/// "Iniciar sesión con Apple" con la ventana nativa (Face ID / Touch ID).
/// Devuelve el identityToken de Apple; la app lo cambia por una sesión de Supabase con signInWithIdToken.
/// `nonce`: el SHA-256 (hex) del nonce que la app le manda después a Supabase.
@objc(DarfApplePlugin)
public class DarfApplePlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "DarfApplePlugin"
    public let jsName = "DarfApple"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "entrar", returnType: CAPPluginReturnPromise)
    ]

    private var llamada: CAPPluginCall?

    @objc func entrar(_ call: CAPPluginCall) {
        let solicitud = ASAuthorizationAppleIDProvider().createRequest()
        solicitud.requestedScopes = [.fullName, .email]
        solicitud.nonce = call.getString("nonce")
        llamada = call
        DispatchQueue.main.async {
            let controlador = ASAuthorizationController(authorizationRequests: [solicitud])
            controlador.delegate = self
            controlador.presentationContextProvider = self
            controlador.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = llamada else { return }
        llamada = nil
        guard let credencial = authorization.credential as? ASAuthorizationAppleIDCredential,
              let datos = credencial.identityToken,
              let token = String(data: datos, encoding: .utf8) else {
            call.reject("Apple no devolvió la credencial.", "SIN_TOKEN")
            return
        }
        // Apple solo manda nombre y correo la PRIMERA vez que la persona entra a la app.
        call.resolve([
            "identityToken": token,
            "nombre": credencial.fullName?.givenName ?? "",
            "apellido": credencial.fullName?.familyName ?? "",
            "correo": credencial.email ?? ""
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = llamada else { return }
        llamada = nil
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            call.reject("La persona canceló.", "CANCELADO")
        } else {
            call.reject(error.localizedDescription, "ERROR")
        }
    }
}
