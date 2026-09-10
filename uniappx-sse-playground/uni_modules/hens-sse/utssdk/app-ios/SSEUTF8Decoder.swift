import Foundation

// URLSession data callbacks may end in the middle of a UTF-8 scalar.
final class SSEUTF8Decoder {
    private var pending: [UInt8] = []

    func decode(_ data: Data, final: Bool = false) -> String {
        let bytes = pending + data
        pending.removeAll(keepingCapacity: true)
        var end = bytes.count
        if !final && !bytes.isEmpty {
            var start = bytes.count - 1
            while start > 0 && bytes[start] & 0xc0 == 0x80 && bytes.count - start < 4 {
                start -= 1
            }
            let lead = bytes[start]
            let length = lead >= 0xc2 && lead <= 0xdf ? 2 :
                (lead >= 0xe0 && lead <= 0xef ? 3 : (lead >= 0xf0 && lead <= 0xf4 ? 4 : 0))
            let available = bytes.count - start
            var valid = length > available
            if valid && available > 1 {
                let second = bytes[start + 1]
                valid = (lead != 0xe0 || second >= 0xa0) && (lead != 0xed || second <= 0x9f) &&
                    (lead != 0xf0 || second >= 0x90) && (lead != 0xf4 || second <= 0x8f)
            }
            if valid {
                pending = Array(bytes[start...])
                end = start
            }
        }
        // Malformed or truncated input is replaced with U+FFFD, never dropped with its surrounding text.
        return String(decoding: bytes[..<end], as: UTF8.self)
    }
}
