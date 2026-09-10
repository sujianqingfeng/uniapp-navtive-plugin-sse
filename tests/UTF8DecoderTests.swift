import Foundation

@main
struct UTF8DecoderTests {
    static func main() {
        let inputs: [[UInt8]] = [
            Array("data: {\"text\":\"你好🙂é𐀀\"}\r\n\r\n".utf8),
            [0x61, 0xe4, 0xbd],
            [0x61, 0xff, 0xe0, 0x80, 0x80, 0x62],
            [0xf0, 0x9f, 0x61, 0xed, 0xa0, 0x80],
            [0xf4, 0x90, 0x80, 0x80, 0xc0, 0xaf]
        ]
        var cases = 0
        for bytes in inputs {
            let expected = String(decoding: bytes, as: UTF8.self)
            for first in 0...bytes.count {
                for second in first...bytes.count {
                    let decoder = SSEUTF8Decoder()
                    let actual = decoder.decode(Data(bytes[..<first])) +
                        decoder.decode(Data(bytes[first..<second])) +
                        decoder.decode(Data(bytes[second...])) + decoder.decode(Data(), final: true)
                    precondition(actual == expected, "UTF-8 mismatch at \(first), \(second): \(bytes)")
                    cases += 1
                }
            }
        }
        let left = SSEUTF8Decoder()
        let right = SSEUTF8Decoder()
        precondition(left.decode(Data([0xe4])) == "")
        precondition(right.decode(Data([0xf0, 0x9f])) == "")
        precondition(left.decode(Data([0xbd, 0xa0])) == "你")
        precondition(right.decode(Data([0x99, 0x82])) == "🙂")
        precondition(left.decode(Data(), final: true) == "")
        print("UTF-8: \(cases) split cases and independent connections passed")
    }
}
