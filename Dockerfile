
FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY ProducerConsumerServer.java .

RUN javac --add-modules jdk.httpserver ProducerConsumerServer.java

EXPOSE 8080

CMD ["java", "--add-modules", "jdk.httpserver", "ProducerConsumerServer"]
