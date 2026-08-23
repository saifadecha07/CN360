using UnityEngine;

public class CommandManager : MonoBehaviour
{
    public Transform head;
    public UdpTransport udpTransport;

    public float sendRate = 20f;

    private float timer;

    void Update()
    {
        if (head == null || udpTransport == null)
            return;

        Vector3 rotation = head.localEulerAngles;

        float pitch = NormalizeAngle(rotation.x);
        float yaw = NormalizeAngle(rotation.y);
        float roll = NormalizeAngle(rotation.z);

        timer += Time.deltaTime;

        if (timer >= 1f / sendRate)
        {
            string message =
                $"HEAD,{yaw:F1},{pitch:F1},{roll:F1}";

            udpTransport.Send(message);

            Debug.Log(message);

            timer = 0f;
        }
    }

    float NormalizeAngle(float angle)
    {
        if (angle > 180f)
            angle -= 360f;

        return angle;
    }
}