import Foundation
import DCloudUTSFoundation

@objc(SSEStreamManager)
@objcMembers
public class SSEStreamManager: NSObject, URLSessionDataDelegate {
    public static let shared = SSEStreamManager()

    public var onOpen: ((String, NSNumber, UTSJSONObject) -> Void)?
    public var onChunk: ((String, String) -> Void)?
    public var onError: ((String, String) -> Void)?
    public var onComplete: ((String) -> Void)?

    private final class StreamTaskContext {
        let task: URLSessionDataTask
        let decoder = SSEUTF8Decoder()
        init(task: URLSessionDataTask) {
            self.task = task
        }
    }

    private let queue = DispatchQueue(label: "com.hans.sseplugin.stream")
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = TimeInterval(Int.max)
        configuration.timeoutIntervalForResource = TimeInterval(Int.max)
        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1
        return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
    }()
    private var taskMap: [String: StreamTaskContext] = [:]

    public func connect(
        _ requestId: String,
        _ urlString: String,
        _ method: String,
        _ protocolName: String,
        _ timeout: NSNumber,
        _ headers: UTSJSONObject?,
        _ bodyText: String?
    ) -> Bool {
        guard let url = URL(string: urlString) else {
            return false
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout.doubleValue / 1000.0
        request.setValue(protocolName == "sse" ? "text/event-stream" : "text/plain", forHTTPHeaderField: "Accept")

        if let headerMap = headers?.toMap() {
            for (key, value) in headerMap {
                request.setValue("\(value)", forHTTPHeaderField: key)
            }
        }

        if let bodyText = bodyText, method != "GET", method != "HEAD" {
            request.httpBody = bodyText.data(using: .utf8)
            if request.value(forHTTPHeaderField: "Content-Type") == nil {
                request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            }
        }

        let task = session.dataTask(with: request)
        task.taskDescription = requestId
        task.earliestBeginDate = nil

        queue.sync {
            self.taskMap[requestId]?.task.cancel()
            self.taskMap[requestId] = StreamTaskContext(task: task)
        }

        task.resume()
        return true
    }

    public func abort(_ requestId: String) {
        queue.sync {
            if let context = self.taskMap.removeValue(forKey: requestId) {
                context.task.cancel()
            }
        }
    }

    private func emitOpen(_ requestId: String, _ response: HTTPURLResponse) {
        let headers = UTSJSONObject(response.allHeaderFields as? [String: Any] ?? [:])
        DispatchQueue.main.async {
            self.onOpen?(requestId, NSNumber(value: response.statusCode), headers)
        }
    }

    private func emitChunk(_ requestId: String, _ text: String) {
        guard !text.isEmpty else {
            return
        }
        DispatchQueue.main.async {
            self.onChunk?(requestId, text)
        }
    }

    private func emitError(_ requestId: String, _ message: String) {
        DispatchQueue.main.async {
            self.onError?(requestId, message)
        }
    }

    private func emitComplete(_ requestId: String) {
        DispatchQueue.main.async {
            self.onComplete?(requestId)
        }
    }

    public func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let requestId = dataTask.taskDescription else {
            completionHandler(.cancel)
            return
        }

        if let httpResponse = response as? HTTPURLResponse {
            emitOpen(requestId, httpResponse)
        }
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let requestId = dataTask.taskDescription else {
            return
        }
        let text = queue.sync {
            self.taskMap[requestId]?.decoder.decode(data) ?? ""
        }
        emitChunk(requestId, text)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let requestId = task.taskDescription else {
            return
        }

        let tail = queue.sync {
            self.taskMap.removeValue(forKey: requestId)?.decoder.decode(Data(), final: true) ?? ""
        }
        if error == nil { emitChunk(requestId, tail) }

        if let nsError = error as NSError? {
          if nsError.code != NSURLErrorCancelled {
              emitError(requestId, nsError.localizedDescription)
          }
          emitComplete(requestId)
          return
        }

        emitComplete(requestId)
    }
}
