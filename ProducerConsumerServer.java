
package backend;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.Semaphore;

public class ProducerConsumerServer {

    private static final int CAPACITY = 5;

    // Shared bounded FIFO buffer
    private static final Deque<String> buffer = new ArrayDeque<>();

    // Synchronization semaphores
    private static final Semaphore empty = new Semaphore(CAPACITY);
    private static final Semaphore full = new Semaphore(0);
    private static final Semaphore mutex = new Semaphore(1);

    // Protects complete operations and consistent state reads/reset
    private static final Object operationLock = new Object();

    private static final List<String> eventLog = new ArrayList<>();

    private static int nextId = 1;
    private static int produced = 0;
    private static int consumed = 0;

    private static void addLog(String message) {
        eventLog.add(message);

        if (eventLog.size() > 100) {
            eventLog.remove(0);
        }

        System.out.println(message);
    }

    // Returns false immediately when the buffer is full.
    private static boolean produce() throws InterruptedException {
        synchronized (operationLock) {
            if (!empty.tryAcquire()) {
                addLog("Producer rejected: buffer is FULL.");
                return false;
            }

            boolean locked = false;

            try {
                mutex.acquire();
                locked = true;

                String item = "Item-" + nextId++;
                buffer.addLast(item);
                produced++;

                // Publish the item before releasing the mutex.
                full.release();

                addLog("Produced " + item);
                return true;

            } catch (InterruptedException e) {
                empty.release();
                throw e;

            } finally {
                if (locked) {
                    mutex.release();
                }
            }
        }
    }

    // Returns false immediately when the buffer is empty.
    private static boolean consume() throws InterruptedException {
        synchronized (operationLock) {
            if (!full.tryAcquire()) {
                addLog("Consumer rejected: buffer is EMPTY.");
                return false;
            }

            boolean locked = false;

            try {
                mutex.acquire();
                locked = true;

                String item = buffer.removeFirst();
                consumed++;

                // Publish the freed slot before releasing the mutex.
                empty.release();

                addLog("Consumed " + item);
                return true;

            } catch (InterruptedException e) {
                full.release();
                throw e;

            } finally {
                if (locked) {
                    mutex.release();
                }
            }
        }
    }

    private static void reset() throws InterruptedException {
        synchronized (operationLock) {
            mutex.acquire();

            try {
                buffer.clear();

                produced = 0;
                consumed = 0;
                nextId = 1;

                // Restore semaphore permits to the initial state.
                empty.drainPermits();
                full.drainPermits();

                empty.release(CAPACITY);

                eventLog.clear();
                addLog("Simulation reset.");

            } finally {
                mutex.release();
            }
        }
    }

    private static String escapeJson(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    // Called while operationLock is held.
    private static String getState() {
        StringBuilder items = new StringBuilder();
        boolean first = true;

        for (String item : buffer) {
            if (!first) {
                items.append(",");
            }

            items.append("\"")
                 .append(escapeJson(item))
                 .append("\"");

            first = false;
        }

        StringBuilder logs = new StringBuilder();
        int start = Math.max(0, eventLog.size() - 20);

        for (int i = start; i < eventLog.size(); i++) {
            if (logs.length() > 0) {
                logs.append(",");
            }

            logs.append("\"")
                .append(escapeJson(eventLog.get(i)))
                .append("\"");
        }

        return "{"
                + "\"capacity\":" + CAPACITY + ","
                + "\"buffer\":[" + items + "],"
                + "\"count\":" + buffer.size() + ","
                + "\"produced\":" + produced + ","
                + "\"consumed\":" + consumed + ","
                + "\"empty\":" + empty.availablePermits() + ","
                + "\"full\":" + full.availablePermits() + ","
                + "\"mutex\":\""
                + (mutex.availablePermits() == 1
                    ? "Unlocked" : "Locked")
                + "\","
                + "\"log\":[" + logs + "]"
                + "}";
    }

    private static void send(
            HttpExchange exchange,
            int status,
            String response
    ) throws IOException {

        exchange.getResponseHeaders().set(
                "Content-Type",
                "application/json; charset=UTF-8"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Origin", "*"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Methods",
                "GET, POST, OPTIONS"
        );

        exchange.getResponseHeaders().set(
                "Access-Control-Allow-Headers", "Content-Type"
        );

        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);

        exchange.sendResponseHeaders(status, bytes.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static void handle(HttpExchange exchange)
            throws IOException {

        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        if ("OPTIONS".equalsIgnoreCase(method)) {
            exchange.getResponseHeaders().set(
                    "Access-Control-Allow-Origin", "*"
            );
            exchange.getResponseHeaders().set(
                    "Access-Control-Allow-Methods",
                    "GET, POST, OPTIONS"
            );
            exchange.getResponseHeaders().set(
                    "Access-Control-Allow-Headers", "Content-Type"
            );

            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        try {
            if ("/state".equals(path)
                    && "GET".equalsIgnoreCase(method)) {

                String state;

                synchronized (operationLock) {
                    state = getState();
                }

                send(exchange, 200, state);
                return;
            }

            if ("/produce".equals(path)
                    && "POST".equalsIgnoreCase(method)) {

                boolean success = produce();
                String state;

                synchronized (operationLock) {
                    state = getState();
                }

                send(exchange, success ? 200 : 409, state);
                return;
            }

            if ("/consume".equals(path)
                    && "POST".equalsIgnoreCase(method)) {

                boolean success = consume();
                String state;

                synchronized (operationLock) {
                    state = getState();
                }

                send(exchange, success ? 200 : 409, state);
                return;
            }

            if ("/reset".equals(path)
                    && "POST".equalsIgnoreCase(method)) {

                reset();

                String state;

                synchronized (operationLock) {
                    state = getState();
                }

                send(exchange, 200, state);
                return;
            }

            send(exchange, 404, "{\"error\":\"Endpoint not found\"}");

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();

            try {
                send(exchange, 500,
                        "{\"error\":\"Operation interrupted\"}");
            } catch (IOException ignored) {
                // The connection may already be closed.
            }

        } catch (Exception e) {
            e.printStackTrace();

            try {
                send(exchange, 500,
                        "{\"error\":\"Internal server error\"}");
            } catch (IOException ignored) {
                // The connection may already be closed.
            }

        } finally {
            exchange.close();
        }
    }

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(
                new InetSocketAddress("localhost", 8080), 0
        );

        server.createContext("/", ProducerConsumerServer::handle);

        server.setExecutor(
                java.util.concurrent.Executors.newFixedThreadPool(4)
        );

        server.start();

        System.out.println("Producer-Consumer backend started.");
        System.out.println("State: http://localhost:8080/state");
        System.out.println("Capacity: " + CAPACITY);
        System.out.println("Press Ctrl+C to stop.");
    }
}
