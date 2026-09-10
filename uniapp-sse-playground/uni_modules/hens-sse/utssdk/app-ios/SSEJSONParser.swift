import Foundation
import DCloudUTSFoundation

@objc(SSEJSONParser)
@objcMembers
public class SSEJSONParser: NSObject {
    public static func parse(_ text: String) -> Any? {
        // UTS JSON.parse converts NSNull to nil; the JS bridge then removes array
        // entries and object keys. Keep Foundation's explicit JSON null values.
        guard let value = try? JSONSerialization.jsonObject(with: Data(text.utf8)) else {
            return nil
        }
        if let object = value as? [String: Any] {
            return UTSJSONObject(object)
        }
        return value
    }
}
