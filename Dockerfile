
FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY ProducerConsumerServer.java .

RUN mkdir -p backend \
    && javac --add-modules jdk.httpserver -d . ProducerConsumerServer.java

EXPOSE 8080

CMD ["java", "--add-modules", "jdk.httpserver", "backend.ProducerConsumerServer"]
